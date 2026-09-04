-- ============================================================
-- Esquema SQLite — Sistema de administración de estacionamientos
-- ============================================================
-- Multi-estacionamiento desde el diseño: toda tabla operativa lleva
-- estacionamiento_id, aunque hoy solo se opere un estacionamiento.
--
-- Fechas/horas se guardan como TEXT en formato ISO 8601 UTC
-- (mismo formato que Date#toISOString() en JS), para poder ordenar
-- y comparar con operadores de texto sin conversión.
-- ============================================================

PRAGMA foreign_keys = ON;

-- ============================================================
-- Estacionamientos
-- ============================================================
CREATE TABLE IF NOT EXISTS estacionamientos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre        TEXT NOT NULL,
  direccion     TEXT,
  -- Texto libre que se imprime en cada boleto de este estacionamiento
  -- (datos de facturación, dirección fiscal, avisos, etc.). Se captura a
  -- mano por instalación desde la configuración de admin; NULL hasta
  -- entonces.
  texto_boleto  TEXT,
  -- Cargo fijo extra que se suma al cobro normal cuando el cliente perdió
  -- su boleto de papel (ver cerrarBoletoPerdido en src/db/boletos.ts).
  cargo_boleto_perdido REAL NOT NULL DEFAULT 0,
  activo        INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ============================================================
-- Usuarios — admin (configura tarifas/series/usuarios) o empleado
-- (solo emite boletos y cobra).
-- ============================================================
CREATE TABLE IF NOT EXISTS usuarios (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  estacionamiento_id  INTEGER NOT NULL REFERENCES estacionamientos(id),
  nombre_usuario      TEXT NOT NULL,
  password_hash       TEXT NOT NULL,
  nombre_completo     TEXT NOT NULL,
  rol                 TEXT NOT NULL CHECK (rol IN ('admin', 'empleado')),
  activo              INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (estacionamiento_id, nombre_usuario)
);

-- ============================================================
-- Tipos de vehículo — configurables por estacionamiento
-- (auto, camioneta, camión, ...), cada uno con tarifas independientes.
-- ============================================================
CREATE TABLE IF NOT EXISTS tipos_vehiculo (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  estacionamiento_id  INTEGER NOT NULL REFERENCES estacionamientos(id),
  nombre              TEXT NOT NULL,
  orden               INTEGER NOT NULL DEFAULT 0,
  activo              INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (estacionamiento_id, nombre)
);

-- ============================================================
-- Series de folio — ej. serie A y B con proporción configurable (3:1, 5:2).
-- contador_emitidos y proporcion alimentan el reparto round-robin ponderado
-- entre series; la lógica de asignación vive en /src/logic, esta tabla solo
-- guarda el estado (siguiente número disponible y cuántos van emitidos).
-- ============================================================
CREATE TABLE IF NOT EXISTS series_folio (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  estacionamiento_id  INTEGER NOT NULL REFERENCES estacionamientos(id),
  serie               TEXT NOT NULL,
  proporcion          INTEGER NOT NULL CHECK (proporcion > 0),
  siguiente_numero    INTEGER NOT NULL DEFAULT 1,
  contador_emitidos   INTEGER NOT NULL DEFAULT 0,
  activo              INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  UNIQUE (estacionamiento_id, serie)
);

-- ============================================================
-- Tarifa progresiva — cabecera por tipo de vehículo, versionada en el tiempo.
-- Al emitir un boleto se guarda el id de la tarifa vigente en ese momento
-- (ver boletos.tarifa_progresiva_id), así un cambio de precios posterior
-- no altera el cobro de boletos ya abiertos.
-- El índice único parcial garantiza una sola tarifa activa (vigente_hasta
-- NULL) por estacionamiento + tipo de vehículo.
-- ============================================================
CREATE TABLE IF NOT EXISTS tarifas_progresivas (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  estacionamiento_id    INTEGER NOT NULL REFERENCES estacionamientos(id),
  tipo_vehiculo_id      INTEGER NOT NULL REFERENCES tipos_vehiculo(id),
  tarifa_maxima_diaria  REAL NOT NULL DEFAULT 0,
  vigente_desde         TEXT NOT NULL,
  vigente_hasta         TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tarifas_progresivas_activa_unica
  ON tarifas_progresivas (estacionamiento_id, tipo_vehiculo_id)
  WHERE vigente_hasta IS NULL;

-- Precio incremental por bloque de 15 min (1..24, ver
-- BLOQUES_CONFIGURABLES en src/logic/motorTarifas.ts). Después del
-- bloque 24 el motor repite el precio del bloque 24.
CREATE TABLE IF NOT EXISTS tarifas_progresivas_bloques (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  tarifa_progresiva_id  INTEGER NOT NULL REFERENCES tarifas_progresivas(id),
  numero_bloque         INTEGER NOT NULL CHECK (numero_bloque BETWEEN 1 AND 24),
  precio                REAL NOT NULL,
  UNIQUE (tarifa_progresiva_id, numero_bloque)
);

-- ============================================================
-- Tarifa plana — opcional, se ofrece y decide al EMITIR el boleto
-- (no al cobrar). Pueden existir varios paquetes activos por tipo de
-- vehículo (ej. "medio día", "día completo").
-- ============================================================
CREATE TABLE IF NOT EXISTS tarifas_planas (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  estacionamiento_id  INTEGER NOT NULL REFERENCES estacionamientos(id),
  tipo_vehiculo_id    INTEGER NOT NULL REFERENCES tipos_vehiculo(id),
  nombre              TEXT NOT NULL,
  precio_fijo         REAL NOT NULL,
  horas_incluidas     REAL NOT NULL,
  vigente_desde       TEXT NOT NULL,
  vigente_hasta       TEXT,
  activo              INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_tarifas_planas_vigentes
  ON tarifas_planas (estacionamiento_id, tipo_vehiculo_id)
  WHERE activo = 1 AND vigente_hasta IS NULL;

-- ============================================================
-- Boletos — un renglón por vehículo estacionado. folio + serie forman el
-- número impreso en código de barras (Code128); se generan al emitir.
-- tarifa_progresiva_id / tarifa_plana_id quedan fijos como snapshot de la
-- tarifa vigente al momento de emisión.
-- ============================================================
CREATE TABLE IF NOT EXISTS boletos (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  estacionamiento_id    INTEGER NOT NULL REFERENCES estacionamientos(id),
  serie                 TEXT NOT NULL,
  folio                 INTEGER NOT NULL,
  tipo_vehiculo_id      INTEGER NOT NULL REFERENCES tipos_vehiculo(id),
  tarifa_progresiva_id  INTEGER NOT NULL REFERENCES tarifas_progresivas(id),
  tarifa_plana_id       INTEGER REFERENCES tarifas_planas(id),
  placa                 TEXT,
  hora_entrada          TEXT NOT NULL,
  hora_salida           TEXT,
  minutos_totales       INTEGER,
  monto_cobrado         REAL,
  excedente_minutos     INTEGER,
  excedente_monto       REAL,
  -- Se marca cuando se cerró vía "Boleto perdido" (ver
  -- cerrarBoletoPerdido) — monto_cobrado ya incluye recargo_boleto_perdido,
  -- igual que ya incluye excedente_monto.
  boleto_perdido        INTEGER NOT NULL DEFAULT 0 CHECK (boleto_perdido IN (0, 1)),
  recargo_boleto_perdido REAL,
  estado                TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'cerrado', 'cancelado')),
  usuario_emision_id    INTEGER NOT NULL REFERENCES usuarios(id),
  usuario_cobro_id      INTEGER REFERENCES usuarios(id),
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (estacionamiento_id, serie, folio)
);

CREATE INDEX IF NOT EXISTS idx_boletos_abiertos
  ON boletos (estacionamiento_id, estado);

CREATE INDEX IF NOT EXISTS idx_boletos_hora_entrada
  ON boletos (estacionamiento_id, hora_entrada);

CREATE INDEX IF NOT EXISTS idx_boletos_hora_salida
  ON boletos (estacionamiento_id, hora_salida);

-- ============================================================
-- Intentos de recobro — alguien vuelve a escanear un boleto que ya no
-- está abierto (ver cobrarBoletoPorFolio en src/db/boletos.ts). Puede ser
-- un doble escaneo honesto, o un boleto reciclado a propósito para
-- cobrarlo dos veces (el cliente ya se fue, alguien se queda con el
-- segundo cobro en efectivo) — no se bloquea nada en el momento, solo se
-- deja rastro de quién y cuándo para poder revisar el patrón después.
-- ============================================================
CREATE TABLE IF NOT EXISTS intentos_recobro (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  boleto_id    INTEGER NOT NULL REFERENCES boletos(id),
  usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
  intentado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_intentos_recobro_boleto ON intentos_recobro (boleto_id);
CREATE INDEX IF NOT EXISTS idx_intentos_recobro_usuario ON intentos_recobro (usuario_id);

-- ============================================================
-- Cortes de caja — cierre de un periodo (turno o día). No guarda una copia
-- de los boletos: el rango (desde, hasta] sobre boletos.hora_salida se usa
-- para reconstruir el detalle cuando se necesite (ver obtenerDetalleCorte).
-- El siguiente corte arranca donde terminó el anterior (desde = hasta del
-- último corte), así nunca se cuenta un boleto dos veces ni se salta ninguno.
-- ============================================================
CREATE TABLE IF NOT EXISTS cortes (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  estacionamiento_id          INTEGER NOT NULL REFERENCES estacionamientos(id),
  desde                       TEXT NOT NULL,
  hasta                       TEXT NOT NULL,
  total_boletos               INTEGER NOT NULL,
  total_monto                 REAL NOT NULL,
  -- Pagos de pensionados cobrados en el mismo periodo — aparte del total de
  -- boletos a propósito (no se suman entre sí aquí) para no cambiarle el
  -- significado a total_monto en cortes ya existentes; el total combinado
  -- ("total en caja") se calcula donde se muestra, no se guarda.
  pensionados_pagos_cantidad  INTEGER NOT NULL DEFAULT 0,
  pensionados_pagos_monto     REAL NOT NULL DEFAULT 0,
  -- Gastos pagados EN EFECTIVO en el mismo periodo — estos sí se restan del
  -- "total en caja" (salen del mismo efectivo de la caja). Gastos por
  -- transferencia/otro no se cuentan aquí (no afectan lo que debe haber
  -- físicamente), aunque sí aparecen listados en el detalle del corte.
  gastos_efectivo_cantidad    INTEGER NOT NULL DEFAULT 0,
  gastos_efectivo_monto       REAL NOT NULL DEFAULT 0,
  usuario_id                  INTEGER NOT NULL REFERENCES usuarios(id),
  created_at                  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_cortes_estacionamiento
  ON cortes (estacionamiento_id, hasta);

-- ============================================================
-- Configuración de correo — credenciales SMTP para enviar el corte de caja
-- por email. Una sola fila por estacionamiento. La contraseña se guarda tal
-- cual (no hasheada, a diferencia de usuarios.password_hash): a diferencia
-- del login propio, esta sí se necesita en texto plano para autenticarse
-- contra el servidor SMTP real. Queda protegida solo por los permisos del
-- archivo SQLite local, igual que cualquier otro dato de la instalación.
-- ============================================================
CREATE TABLE IF NOT EXISTS configuracion_correo (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  estacionamiento_id  INTEGER NOT NULL REFERENCES estacionamientos(id),
  host                TEXT NOT NULL,
  puerto              INTEGER NOT NULL,
  seguro              INTEGER NOT NULL DEFAULT 1 CHECK (seguro IN (0, 1)),
  usuario             TEXT NOT NULL,
  password            TEXT NOT NULL,
  remitente           TEXT NOT NULL,
  destinatarios       TEXT NOT NULL,
  UNIQUE (estacionamiento_id)
);

-- ============================================================
-- Configuración de monitoreo en la nube — credenciales de un proyecto
-- Firebase propio del usuario, para mandar un "latido" periódico (ocupación
-- actual, entradas desde el último corte, último corte) a Firestore y poder
-- ver el estado de varios estacionamientos en tiempo real desde /panel-operador.
-- `slug` identifica a este estacionamiento dentro del proyecto compartido —
-- cada instalación necesita uno único, elegido a mano por el admin (la base
-- local siempre tiene un solo estacionamiento con id=1, así que el id local
-- no sirve para distinguirlos en la nube).
-- ============================================================
CREATE TABLE IF NOT EXISTS configuracion_monitoreo (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  estacionamiento_id  INTEGER NOT NULL REFERENCES estacionamientos(id),
  habilitado          INTEGER NOT NULL DEFAULT 0 CHECK (habilitado IN (0, 1)),
  api_key             TEXT NOT NULL,
  project_id          TEXT NOT NULL,
  slug                TEXT NOT NULL,
  UNIQUE (estacionamiento_id)
);

-- ============================================================
-- Configuración de facturación — datos fiscales del emisor para este
-- estacionamiento. Cada instalación puede tener su propio RFC/régimen
-- (muchas operan bajo RESICO), así que esto vive por estacionamiento igual
-- que el resto de la configuración, no de forma global a la app.
-- OJO: aquí NO se guarda el CSD ni la Secret Key de FacturAPI — esos solo
-- viven del lado del Cloud Function (ver plan de facturación), nunca en
-- este SQLite local ni en el portal público.
-- ============================================================
CREATE TABLE IF NOT EXISTS configuracion_facturacion (
  id                            INTEGER PRIMARY KEY AUTOINCREMENT,
  estacionamiento_id            INTEGER NOT NULL REFERENCES estacionamientos(id),
  habilitado                    INTEGER NOT NULL DEFAULT 0 CHECK (habilitado IN (0, 1)),
  rfc                           TEXT NOT NULL,
  razon_social                  TEXT NOT NULL,
  regimen_fiscal                TEXT NOT NULL,
  codigo_postal_fiscal          TEXT NOT NULL,
  clave_producto_servicio       TEXT NOT NULL DEFAULT '78101803',
  clave_unidad                  TEXT NOT NULL DEFAULT 'E48',
  UNIQUE (estacionamiento_id)
);

-- ============================================================
-- Impresora fija por tipo de impresión — para no tener que confirmar el
-- diálogo de Windows en cada boleto. Si una queda en NULL (sin configurar),
-- se sigue preguntando con el diálogo normal en vez de fallar.
-- ============================================================
CREATE TABLE IF NOT EXISTS configuracion_impresion (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  estacionamiento_id  INTEGER NOT NULL REFERENCES estacionamientos(id),
  impresora_ticket    TEXT,
  impresora_reporte   TEXT,
  -- Modo crudo (ESC/POS directo por USB, ver src/main/escpos.ts y
  -- src/main/escposUsb.ts) — para impresoras térmicas cuyo driver gráfico
  -- no se puede instalar en Windows. Opcional, apagado por default.
  ticket_modo_crudo     INTEGER NOT NULL DEFAULT 0 CHECK (ticket_modo_crudo IN (0, 1)),
  ticket_usb_vendor_id  INTEGER,
  ticket_usb_product_id INTEGER,
  UNIQUE (estacionamiento_id)
);

-- ============================================================
-- Modo "solo serie A" — atajo de emergencia (Ctrl+Shift+A, cualquier
-- usuario) para desactivar de golpe todas las series salvo A, ej. si se
-- acabaron los boletos físicos de la serie B a medio turno. series_respaldo
-- guarda (en JSON) los ids de las series que estaban activas antes de
-- forzar el modo, para poder restaurar exactamente ese estado al apagarlo
-- en vez de reactivar todo a ciegas.
-- ============================================================
CREATE TABLE IF NOT EXISTS estado_solo_serie_a (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  estacionamiento_id  INTEGER NOT NULL REFERENCES estacionamientos(id),
  activo              INTEGER NOT NULL DEFAULT 0 CHECK (activo IN (0, 1)),
  series_respaldo     TEXT,
  UNIQUE (estacionamiento_id)
);

-- ============================================================
-- Clave del cifrado Feistel del folio impreso/escaneado (ver
-- src/logic/folioCifrado.ts) — para que un cliente no pueda inferir el
-- volumen de boletos comparando su folio con el de otro. Se genera sola la
-- primera vez que hace falta y NUNCA debe cambiar después: si cambiara,
-- los tickets ya impresos dejarían de poder escanearse correctamente.
-- ============================================================
CREATE TABLE IF NOT EXISTS clave_cifrado_folio (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  estacionamiento_id  INTEGER NOT NULL REFERENCES estacionamientos(id),
  clave               TEXT NOT NULL,
  UNIQUE (estacionamiento_id)
);

-- ============================================================
-- Pensionados — clientes que pagan una cuota mensual por acceso libre, en
-- vez de pagar por boleto. `estado`/`fecha_baja` documentan la baja sin
-- borrar el historial. `vigente_hasta` no se guarda aquí: se calcula a
-- partir del último pago (o de fecha_alta si nunca ha pagado), ver
-- src/db/pensionados.ts — así nunca se desincroniza de los pagos reales.
-- ============================================================
CREATE TABLE IF NOT EXISTS pensionados (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  estacionamiento_id  INTEGER NOT NULL REFERENCES estacionamientos(id),
  nombre              TEXT NOT NULL,
  telefono            TEXT,
  placa               TEXT,
  tipo_vehiculo_id    INTEGER NOT NULL REFERENCES tipos_vehiculo(id),
  cuota_mensual       REAL NOT NULL,
  fecha_alta          TEXT NOT NULL,
  estado              TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'baja')),
  fecha_baja          TEXT,
  usuario_alta_id     INTEGER NOT NULL REFERENCES usuarios(id),
  usuario_baja_id     INTEGER REFERENCES usuarios(id),
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_pensionados_estado ON pensionados (estacionamiento_id, estado);

-- Un renglón por mensualidad cobrada. periodo_desde/periodo_hasta es el
-- rango que ese pago cubre (no necesariamente calendario exacto: permite
-- prorrateos). El próximo folio/vigencia se deriva del más reciente por
-- pensionado, nunca se actualiza in place.
CREATE TABLE IF NOT EXISTS pensionados_pagos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  pensionado_id   INTEGER NOT NULL REFERENCES pensionados(id),
  periodo_desde   TEXT NOT NULL,
  periodo_hasta   TEXT NOT NULL,
  monto           REAL NOT NULL,
  usuario_id      INTEGER NOT NULL REFERENCES usuarios(id),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_pensionados_pagos_pensionado ON pensionados_pagos (pensionado_id, periodo_hasta);

-- ============================================================
-- Gastos — chicos del día a día (papelería, mantenimiento, etc.) y
-- periódicos (nómina, luz, agua, internet). Solo los de forma_pago
-- 'efectivo' salen de la caja del estacionamiento y se restan en los
-- cortes (ver src/db/cortes.ts, src/db/corteMensual.ts); los demás quedan
-- igual de registrados, para tener el control completo, pero no afectan la
-- conciliación de efectivo.
-- ============================================================
CREATE TABLE IF NOT EXISTS gastos (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  estacionamiento_id  INTEGER NOT NULL REFERENCES estacionamientos(id),
  concepto            TEXT NOT NULL,
  categoria           TEXT NOT NULL CHECK (categoria IN ('operativo', 'nomina', 'servicios', 'otro')),
  monto               REAL NOT NULL,
  forma_pago          TEXT NOT NULL DEFAULT 'efectivo' CHECK (forma_pago IN ('efectivo', 'transferencia', 'otro')),
  fecha               TEXT NOT NULL,
  usuario_id          INTEGER NOT NULL REFERENCES usuarios(id),
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_gastos_estacionamiento ON gastos (estacionamiento_id, fecha);

-- ============================================================
-- Boletos de cada serie dentro de un corte — un renglón por serie que
-- estaba ACTIVA al generar ese corte (ver src/db/cortes.ts). Una serie
-- desactivada (ej. modo "solo serie A") no genera renglón aquí: su rango
-- (desde, hasta] sigue esperando, sin avanzar, hasta que vuelva a
-- incluirse en un corte — así no se pierde ni se duplica lo que se cobró
-- de esa serie mientras estuvo pausada. desde/hasta pueden ser distintos
-- entre series del MISMO corte si alguna llevaba más tiempo sin cortarse.
-- ============================================================
CREATE TABLE IF NOT EXISTS cortes_series (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  corte_id      INTEGER NOT NULL REFERENCES cortes(id),
  serie         TEXT NOT NULL,
  desde         TEXT NOT NULL,
  hasta         TEXT NOT NULL,
  total_boletos INTEGER NOT NULL,
  total_monto   REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cortes_series_serie ON cortes_series (serie, hasta);

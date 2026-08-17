"""
Motor de cálculo de tarifas — Sistema de estacionamientos
============================================================

Reglas implementadas (validadas en conversación):
1. Tarifa progresiva incremental por bloques de 15 min, hasta 24 bloques (6h).
   Cada bloque tiene su propio precio incremental (se van sumando).
2. Después del bloque 24, se repite el incremental del último bloque configurado.
3. Tope máximo por ciclo de 24 horas corridas desde la hora de entrada
   (no día calendario). Al llegar a las 24h, se reinicia el ciclo.
4. Tarifa plana: se ofrece y decide AL EMITIR el boleto (no al cobrar).
   Si el tiempo transcurrido excede las horas incluidas, se cobra
   precio_fijo + excedente calculado con la tarifa regular progresiva.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional


MINUTOS_POR_BLOQUE = 15
BLOQUES_CONFIGURABLES = 24  # 24 bloques de 15 min = 6 horas
MINUTOS_POR_CICLO = 24 * 60  # tope se aplica por ciclos de 24h


@dataclass
class TarifaProgresiva:
    """Precios incrementales por bloque de 15 min, para un tipo de vehículo
    en un estacionamiento específico. Índice 0 = bloque 1 (primeros 15 min)."""
    precios_por_bloque: list[float]  # longitud BLOQUES_CONFIGURABLES, en blanco = 0.0
    tarifa_maxima_diaria: float  # tope por ciclo de 24h (0 = sin tope)

    def precio_bloque(self, numero_bloque_1_indexed: int) -> float:
        """Precio incremental del bloque N (1-indexed). Después del bloque
        24 se repite el precio del último bloque configurado."""
        if numero_bloque_1_indexed <= BLOQUES_CONFIGURABLES:
            return self.precios_por_bloque[numero_bloque_1_indexed - 1]
        return self.precios_por_bloque[BLOQUES_CONFIGURABLES - 1]


@dataclass
class TarifaPlana:
    precio_fijo: float
    horas_incluidas: float


def _bloques_en(minutos: int) -> int:
    """Redondea minutos hacia arriba a número de bloques de 15 min.
    0 minutos = 0 bloques (no se cobra si sale inmediatamente)."""
    if minutos <= 0:
        return 0
    return -(-minutos // MINUTOS_POR_BLOQUE)  # ceil sin importar float


def calcular_regular(minutos_totales: int, tarifa: TarifaProgresiva) -> float:
    """Calcula el cobro por tarifa regular progresiva, respetando el tope
    máximo por cada ciclo de 24 horas."""
    total = 0.0
    minutos_restantes = minutos_totales

    while minutos_restantes > 0:
        minutos_este_ciclo = min(minutos_restantes, MINUTOS_POR_CICLO)
        bloques = _bloques_en(minutos_este_ciclo)

        acumulado_ciclo = 0.0
        for b in range(1, bloques + 1):
            acumulado_ciclo += tarifa.precio_bloque(b)
            if tarifa.tarifa_maxima_diaria > 0 and acumulado_ciclo >= tarifa.tarifa_maxima_diaria:
                acumulado_ciclo = tarifa.tarifa_maxima_diaria
                break

        total += acumulado_ciclo
        minutos_restantes -= minutos_este_ciclo

    return total


def calcular_cobro(
    hora_entrada: datetime,
    hora_salida: datetime,
    tarifa_regular: TarifaProgresiva,
    tarifa_plana: Optional[TarifaPlana] = None,
) -> dict:
    """Función principal: calcula el monto a cobrar.

    Si tarifa_plana es None -> el boleto se emitió como regular.
    Si tarifa_plana tiene valor -> el boleto se emitió con tarifa plana
    aceptada por el cliente al entrar; se cobra fijo + excedente si aplica.
    """
    minutos_totales = int((hora_salida - hora_entrada).total_seconds() // 60)
    if minutos_totales < 0:
        raise ValueError("hora_salida no puede ser anterior a hora_entrada")

    detalle = {
        "minutos_totales": minutos_totales,
        "tipo_cobro": "plana" if tarifa_plana else "regular",
    }

    if tarifa_plana is None:
        monto = calcular_regular(minutos_totales, tarifa_regular)
        detalle["monto"] = round(monto, 2)
        return detalle

    minutos_incluidos = int(tarifa_plana.horas_incluidas * 60)
    if minutos_totales <= minutos_incluidos:
        detalle["monto"] = round(tarifa_plana.precio_fijo, 2)
        detalle["excedente_minutos"] = 0
        detalle["excedente_monto"] = 0.0
        return detalle

    minutos_excedente = minutos_totales - minutos_incluidos
    monto_excedente = calcular_regular(minutos_excedente, tarifa_regular)

    detalle["excedente_minutos"] = minutos_excedente
    detalle["excedente_monto"] = round(monto_excedente, 2)
    detalle["monto"] = round(tarifa_plana.precio_fijo + monto_excedente, 2)
    return detalle


# ============================================================
# CASOS DE PRUEBA
# ============================================================
if __name__ == "__main__":

    # --- Tarifa de ejemplo: $10 por bloque los primeros 4 bloques (1h),
    # luego $15 por bloque hasta el bloque 24, tope diario $300 ---
    precios = [10.0] * 4 + [15.0] * (BLOQUES_CONFIGURABLES - 4)
    tarifa_regular = TarifaProgresiva(precios_por_bloque=precios, tarifa_maxima_diaria=300.0)

    entrada = datetime(2026, 8, 15, 10, 0)

    print("=== Caso 1: 4 bloques exactos (1h) -> esperado $40 ===")
    salida = entrada + timedelta(hours=1)
    r = calcular_cobro(entrada, salida, tarifa_regular)
    print(r)
    assert r["monto"] == 40.0

    print("\n=== Caso 2: 1h 5min (entra al bloque 5, $15 extra) -> esperado $55 ===")
    salida = entrada + timedelta(hours=1, minutes=5)
    r = calcular_cobro(entrada, salida, tarifa_regular)
    print(r)
    assert r["monto"] == 55.0

    print("\n=== Caso 3: tope diario alcanzado (muchas horas) -> esperado $300 ===")
    salida = entrada + timedelta(hours=20)
    r = calcular_cobro(entrada, salida, tarifa_regular)
    print(r)
    assert r["monto"] == 300.0

    print("\n=== Caso 4: 30 horas (cruza el ciclo de 24h) -> tope x2 ciclos = $600 ===")
    salida = entrada + timedelta(hours=30)
    r = calcular_cobro(entrada, salida, tarifa_regular)
    print(r)
    assert r["monto"] == 600.0  # 24h tope $300 + 6h adicionales también topan a $300

    print("\n=== Caso 5: tu ejemplo -> plana $80 por 8h, se queda 9h ===")
    plana_80_8h = TarifaPlana(precio_fijo=80.0, horas_incluidas=8.0)
    entrada2 = datetime(2026, 8, 15, 9, 0)
    salida2 = entrada2 + timedelta(hours=9)
    r = calcular_cobro(entrada2, salida2, tarifa_regular, tarifa_plana=plana_80_8h)
    print(r)
    # 1h de excedente = 4 bloques a $10 = $40 -> total $120
    assert r["monto"] == 120.0

    print("\n=== Caso 6: plana $80 por 8h, sale a las 7h50 (dentro del tiempo) -> $80 ===")
    salida3 = entrada2 + timedelta(hours=7, minutes=50)
    r = calcular_cobro(entrada2, salida3, tarifa_regular, tarifa_plana=plana_80_8h)
    print(r)
    assert r["monto"] == 80.0

    print("\n✅ Todos los casos de prueba pasaron correctamente.")

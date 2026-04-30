"""
Módulo reservado para integración futura con servicios de IA
(extracción estructurada, scoring, alertas, clasificación de documentos).
No implementa llamadas a red en este prototipo.
"""


def analyze_invoice_text_stub(text: str) -> dict:
    """Reserva: devolver estructura normalizada y score de confianza."""
    return {
        "enabled": False,
        "source": "stub",
        "chars": len(text) if text else 0,
    }

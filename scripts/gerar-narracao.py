"""
gerar-narracao.py — síntese de voz neural para o tutorial do JLB Analytics.

POR QUE ESTE SCRIPT EXISTE:
O vídeo gravado pelo Playwright sai mudo (o Chromium não grava áudio de tela).
Este script lê os textos de narração de cada cena e gera arquivos de áudio
com a voz neural brasileira (pt-BR-FranciscaNeural) via Edge TTS, garantindo
cadência profissional, clara e natural.
"""

import asyncio
import json
import os
import sys
import edge_tts

VOZ = "pt-BR-FranciscaNeural"

async def gerar_audio_cena(texto: str, destino: str):
    communicate = edge_tts.Communicate(texto, VOZ, rate="-2%")
    await communicate.save(destino)

async def main():
    if len(sys.argv) < 3:
        print("Uso: python scripts/gerar-narracao.py <cenas_json_path> <diretorio_saida>")
        sys.exit(1)

    cenas_path = sys.argv[1]
    saida_dir = sys.argv[2]
    os.makedirs(saida_dir, exist_ok=True)

    with open(cenas_path, "r", encoding="utf-8") as f:
        cenas = json.load(f)

    print(f"Sintetizando narração neural para {len(cenas)} cenas com a voz '{VOZ}'...")

    for i, cena in enumerate(cenas):
        cid = cena["id"]
        texto = cena["narracao"]
        arquivo_mp3 = os.path.join(saida_dir, f"audio_{cid}.mp3")
        print(f"  [{i+1}/{len(cenas)}] Sintetizando cena '{cid}'...")
        await gerar_audio_cena(texto, arquivo_mp3)

    print("Narração gerada com sucesso para todas as cenas!")

if __name__ == "__main__":
    asyncio.run(main())

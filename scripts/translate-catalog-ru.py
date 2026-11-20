"""Generate the offline Russian lookup from the pinned public catalog text.

The application never runs this tool or downloads the model. Pass the local
Argos package and an input collected by catalog-localization.mjs --collect.
"""

import argparse
import hashlib
import json
from pathlib import Path
import sys
import zipfile


MODEL_SHA256 = "591d743ae103752b88ffc38785c50421320f4eff93c8967e0d3d2e14d4e27811"
MODEL_ROOT = "translate-en_ru-1_9/"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("model", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--python-libs", type=Path)
    args = parser.parse_args()
    if args.python_libs:
        sys.path.insert(0, str(args.python_libs.resolve()))

    import ctranslate2
    import sentencepiece

    with args.model.open("rb") as model:
        if hashlib.file_digest(model, "sha256").hexdigest() != MODEL_SHA256:
            raise ValueError("Unexpected Argos EN→RU model checksum")
    with zipfile.ZipFile(args.model) as package:
        tokenizer = sentencepiece.SentencePieceProcessor(model_proto=package.read(MODEL_ROOT + "sentencepiece.model"))
        files = {name: package.read(MODEL_ROOT + "model/" + name)
                 for name in ("model.bin", "config.json", "shared_vocabulary.json")}

    source = json.loads(args.source.read_text(encoding="utf-8"))
    originals = source["strings"]
    tokens = tokenizer.encode([" ".join(text.split()) for text in originals], out_type=str)
    order = sorted(range(len(tokens)), key=lambda index: len(tokens[index]))
    translator = ctranslate2.Translator("argos-en-ru", files=files, device="cpu", compute_type="int8",
                                       inter_threads=4, intra_threads=2)
    translations = {}
    results = translator.translate_iterable((tokens[index] for index in order), max_batch_size=48,
                                            beam_size=2, max_input_length=600, max_decoding_length=600)
    for count, (index, result) in enumerate(zip(order, results, strict=True), start=1):
        original = originals[index]
        translations[original] = tokenizer.decode(result.hypotheses[0]).strip() or original
        if count % 2000 == 0 or count == len(order):
            print(f"Translated {count}/{len(order)}", flush=True)

    output = {"commit": source["commit"], "model": "Argos EN→RU 1.9", "strings": dict(sorted(translations.items()))}
    temporary = args.output.with_suffix(".tmp.json")
    temporary.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(args.output)


if __name__ == "__main__":
    main()

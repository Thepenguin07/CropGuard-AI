#!/usr/bin/env bash
# Converts the trained SavedModel into TensorFlow.js format:
#   - model.json          (network topology + manifest)
#   - group1-shardNofM.bin (binary weight shards)
#
# These are the exact files the JS code in src/model.js loads in-browser.
#
# Usage:
#   ./convert_to_tfjs.sh ./output/saved_model ./output/tfjs_model

set -e

SAVED_MODEL_DIR=${1:-./output/saved_model}
TFJS_OUT_DIR=${2:-./output/tfjs_model}

mkdir -p "$TFJS_OUT_DIR"

tensorflowjs_converter \
  --input_format=tf_saved_model \
  --output_format=tfjs_graph_model \
  --signature_name=serving_default \
  --saved_model_tags=serve \
  --quantize_uint8 \
  "$SAVED_MODEL_DIR" \
  "$TFJS_OUT_DIR"

echo "TF.js model written to $TFJS_OUT_DIR"
echo "Copy this folder to: public/model/  in the React app"
echo "  (--quantize_uint8 roughly quarters file size, important for the"
echo "   ~150MB offline PWA cache budget mentioned in the deck)"

"""
CropGuard AI - Model Training Script
====================================
Transfer-learns a MobileNetV2 backbone on the combined dataset described
in the pitch deck:
  - PlantVillage (tomato, potato, maize)          ~88%
  - Rice Leaf Diseases (Kaggle)                    ~5%
  - Wheat Rust Syndrome (Kaggle)                    ~4%
  - Custom field dataset (outdoor phone photos)      ~3%

Expected folder layout (standard Keras "flow_from_directory" format).
Merge/rename all four source datasets into ONE folder tree like this
before running the script:

  data/
    train/
      wheat_healthy/
      wheat_yellow_rust/
      wheat_stem_rust/
      wheat_leaf_rust/
      rice_healthy/
      rice_blast/
      rice_brown_spot/
      rice_leaf_scald/
      tomato_healthy/
      tomato_early_blight/
      tomato_late_blight/
      potato_healthy/
      potato_early_blight/
      potato_late_blight/
      maize_common_rust/
    val/
      <same 15 subfolders>

Run:
  pip install -r requirements.txt
  python train_model.py --data_dir ./data --epochs 20 --fine_tune_epochs 10
"""

import argparse
import json
import os

import tensorflow as tf
from tensorflow.keras import layers, models, optimizers
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.preprocessing.image import ImageDataGenerator

IMG_SIZE = (224, 224)   # MobileNetV2 native input size
BATCH_SIZE = 32
NUM_CLASSES = 15


def build_data_generators(data_dir):
    """Augmentation pipeline approximating the deck's 'brightness/dust/blur
    normalization' step, since field photos are taken outdoors in variable
    light by farmers, not in a studio."""
    train_datagen = ImageDataGenerator(
        rescale=1.0 / 255,
        rotation_range=25,
        width_shift_range=0.15,
        height_shift_range=0.15,
        shear_range=0.1,
        zoom_range=0.2,
        brightness_range=(0.6, 1.4),   # simulates harsh sun / shade / dusk
        horizontal_flip=True,
        fill_mode="nearest",
    )
    val_datagen = ImageDataGenerator(rescale=1.0 / 255)

    train_gen = train_datagen.flow_from_directory(
        os.path.join(data_dir, "train"),
        target_size=IMG_SIZE,
        batch_size=BATCH_SIZE,
        class_mode="categorical",
        shuffle=True,
    )
    val_gen = val_datagen.flow_from_directory(
        os.path.join(data_dir, "val"),
        target_size=IMG_SIZE,
        batch_size=BATCH_SIZE,
        class_mode="categorical",
        shuffle=False,
    )
    return train_gen, val_gen


def build_model(num_classes=NUM_CLASSES):
    """MobileNetV2 backbone (ImageNet weights) + custom classification head.
    Chosen specifically because it is small enough to run client-side via
    TF.js WebGL/WASM on 2GB-RAM Android devices, per the deck's spec."""
    base_model = MobileNetV2(
        input_shape=IMG_SIZE + (3,),
        include_top=False,
        weights="imagenet",
    )
    base_model.trainable = False  # frozen for stage 1

    inputs = layers.Input(shape=IMG_SIZE + (3,))
    x = base_model(inputs, training=False)
    x = layers.GlobalAveragePooling2D()(x)
    x = layers.Dropout(0.3)(x)
    x = layers.Dense(128, activation="relu")(x)
    x = layers.Dropout(0.2)(x)
    outputs = layers.Dense(num_classes, activation="softmax")(x)

    model = models.Model(inputs, outputs)
    return model, base_model


def train(args):
    train_gen, val_gen = build_data_generators(args.data_dir)
    # Compute class weights to fix imbalance
    from sklearn.utils.class_weight import compute_class_weight
    import numpy as np

    classes = list(train_gen.class_indices.values())
    class_weights = compute_class_weight(
    class_weight='balanced',
    classes=np.array(list(train_gen.class_indices.values())),
    y=train_gen.classes
)
    class_weight_dict = dict(enumerate(class_weights))
    print("Class weights:", class_weight_dict)
    # Save the label map exactly as Keras assigns it (alphabetical by
    # default) so it matches what the JS inference code expects.
    class_indices = train_gen.class_indices  # {"maize_common_rust": 0, ...}
    idx_to_label = {str(v): k for k, v in class_indices.items()}
    with open(os.path.join(args.output_dir, "labels.json"), "w") as f:
        json.dump(idx_to_label, f, indent=2)
    print("Saved label map:", idx_to_label)

    model, base_model = build_model(num_classes=len(class_indices))

    # ---- Stage 1: train the new head only ----
    model.compile(
        optimizer=optimizers.Adam(learning_rate=1e-3),
        loss="categorical_crossentropy",
        metrics=["accuracy"],
    )
    print("\n=== Stage 1: training classification head ===")
    model.fit(
        train_gen,
        validation_data=val_gen,
        epochs=args.epochs,
        class_weight=class_weight_dict,
        callbacks=[
            tf.keras.callbacks.EarlyStopping(patience=4, restore_best_weights=True),
            tf.keras.callbacks.ReduceLROnPlateau(patience=2, factor=0.5),
        ],
    )

    # ---- Stage 2: fine-tune top layers of the backbone ----
    print("\n=== Stage 2: fine-tuning MobileNetV2 backbone ===")
    base_model.trainable = True
    # Freeze the early, generic feature layers; only unfreeze the back half.
    fine_tune_at = int(len(base_model.layers) * 0.6)
    for layer in base_model.layers[:fine_tune_at]:
        layer.trainable = False

    model.compile(
        optimizer=optimizers.Adam(learning_rate=1e-5),
        loss="categorical_crossentropy",
        metrics=["accuracy"],
    )
    history = model.fit(
        train_gen,
        validation_data=val_gen,
        epochs=args.fine_tune_epochs,
        callbacks=[
            tf.keras.callbacks.EarlyStopping(patience=4, restore_best_weights=True),
            tf.keras.callbacks.ModelCheckpoint(
                os.path.join(args.output_dir, "best_model.keras"),
                save_best_only=True,
                monitor="val_accuracy",
            ),
        ],
    )

    final_val_acc = max(history.history["val_accuracy"])
    print(f"\nBest validation accuracy: {final_val_acc:.4f}  (target: 0.85)")

    # Save final SavedModel format -- this is the input to tensorflowjs_converter
    saved_model_path = os.path.join(args.output_dir, "saved_model")
    model.export(saved_model_path)
    print(f"\nSavedModel exported to: {saved_model_path}")
    print("Next step: run convert_to_tfjs.sh to produce the model.json + "
          "weight shards consumed by the JS app.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data_dir", default="./data")
    parser.add_argument("--output_dir", default="./output")
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--fine_tune_epochs", type=int, default=10)
    args = parser.parse_args()
    os.makedirs(args.output_dir, exist_ok=True)
    train(args)

"""
CropGuard AI - Dataset Preparation Script
==========================================
Merges the two downloaded Kaggle sources (PlantVillage + Five Crop Diseases)
into the 15-class data/train + data/val structure train_model.py expects.

Run from inside the training/ folder, after both datasets are downloaded to
data_raw/plantvillage and data_raw/five_crop:

    python prepare_dataset.py
"""

import os
import random
import shutil

random.seed(42)
VAL_SPLIT = 0.2  # 80% train / 20% val

PLANTVILLAGE = "data_raw/plantvillage/PlantVillage"
FIVE_CROP = "data_raw/five_crop/Crop Diseases Dataset/Crop Diseases/Crop___Disease"

# (source_folder, target_class_name)
# Multiple sources can map to the same target class -- their images are merged.
SOURCE_MAP = [
    # Wheat
    (f"{FIVE_CROP}/Wheat/Wheat___Healthy", "wheat_healthy"),
    (f"{FIVE_CROP}/Wheat/Wheat___Yellow_Rust", "wheat_yellow_rust"),
    (f"{FIVE_CROP}/Wheat/Wheat___Brown_Rust", "wheat_brown_rust"),
    # Rice
    (f"{FIVE_CROP}/Rice/Rice___Healthy", "rice_healthy"),
    (f"{FIVE_CROP}/Rice/Rice___Brown_Spot", "rice_brown_spot"),
    (f"{FIVE_CROP}/Rice/Rice___Leaf_Blast", "rice_leaf_blast"),
    (f"{FIVE_CROP}/Rice/Rice___Neck_Blast", "rice_neck_blast"),
    # Tomato (PlantVillage only)
    (f"{PLANTVILLAGE}/Tomato_healthy", "tomato_healthy"),
    (f"{PLANTVILLAGE}/Tomato_Early_blight", "tomato_early_blight"),
    (f"{PLANTVILLAGE}/Tomato_Late_blight", "tomato_late_blight"),
    # Potato (merge both sources for more training data)
    (f"{PLANTVILLAGE}/Potato___healthy", "potato_healthy"),
    (f"{FIVE_CROP}/Potato/Potato___Healthy", "potato_healthy"),
    (f"{PLANTVILLAGE}/Potato___Early_blight", "potato_early_blight"),
    (f"{FIVE_CROP}/Potato/Potato___Early_Blight", "potato_early_blight"),
    (f"{PLANTVILLAGE}/Potato___Late_blight", "potato_late_blight"),
    (f"{FIVE_CROP}/Potato/Potato___Late_Blight", "potato_late_blight"),
    # Maize
    (f"{FIVE_CROP}/Corn/Corn___Common_Rust", "maize_common_rust"),
    (f"{FIVE_CROP}/Corn/Corn___Healthy", "maize_healthy"),
]

IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".JPG", ".JPEG", ".PNG")


def collect_images(folder):
    if not os.path.isdir(folder):
        print(f"  WARNING: source folder not found, skipping: {folder}")
        return []
    return [
        os.path.join(folder, f)
        for f in os.listdir(folder)
        if f.endswith(IMAGE_EXTENSIONS)
    ]


def main():
    out_train = "data/train"
    out_val = "data/val"

    # Group sources by target class first, so merged classes (e.g. potato)
    # get one combined shuffle + split instead of two separate ones.
    by_class = {}
    for src, target in SOURCE_MAP:
        by_class.setdefault(target, []).append(src)

    total_train, total_val = 0, 0

    for target_class, source_folders in sorted(by_class.items()):
        all_images = []
        for folder in source_folders:
            imgs = collect_images(folder)
            all_images.extend(imgs)

        if not all_images:
            print(f"SKIPPING {target_class}: no images found in any source folder")
            continue

        random.shuffle(all_images)
        split_idx = int(len(all_images) * (1 - VAL_SPLIT))
        train_imgs = all_images[:split_idx]
        val_imgs = all_images[split_idx:]

        train_dir = os.path.join(out_train, target_class)
        val_dir = os.path.join(out_val, target_class)
        os.makedirs(train_dir, exist_ok=True)
        os.makedirs(val_dir, exist_ok=True)

        for img_path in train_imgs:
            shutil.copy2(img_path, os.path.join(train_dir, os.path.basename(img_path)))
        for img_path in val_imgs:
            shutil.copy2(img_path, os.path.join(val_dir, os.path.basename(img_path)))

        print(f"{target_class}: {len(train_imgs)} train, {len(val_imgs)} val "
              f"(from {len(source_folders)} source folder(s))")
        total_train += len(train_imgs)
        total_val += len(val_imgs)

    print(f"\nDone. Total: {total_train} train images, {total_val} val images "
          f"across {len(by_class)} classes.")
    print("Next step: python train_model.py --data_dir ./data")


if __name__ == "__main__":
    main()

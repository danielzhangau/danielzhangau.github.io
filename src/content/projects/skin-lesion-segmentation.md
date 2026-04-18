---
title: "Skin Lesion Segmentation with Improved U-Net"
description: "Deep learning model for melanoma detection achieving 0.8+ Dice score on the ISIC dataset, using an improved U-Net architecture."
tags: ["Deep Learning", "TensorFlow", "PyTorch", "Computer Vision", "Medical Imaging"]
featured: false
order: 10
category: "academic"
github: "https://github.com/danielzhangau/PatternFlow/tree/topic-recognition/recognition/ISIC_skin_cancer#readme"
image: "/img/isic_project.png"
---

## Overview

Applied an improved U-Net architecture to the ISIC (International Skin Imaging Collaboration) dataset for automated melanoma detection, achieving a minimum Dice score of 0.8 for lesion segmentation.

## Approach

- Implemented improved U-Net with encoder-decoder architecture and skip connections for precise lesion boundary delineation
- Trained on the ISIC skin lesion dataset containing annotated skin patch images with binary segmentation masks
- Optimized with Dice loss function to handle class imbalance between lesion and non-lesion pixels

## Key Learnings

- Pattern recognition via deep convolutional neural networks
- Practical experience with both TensorFlow and PyTorch frameworks
- Medical image preprocessing: normalization, augmentation, and handling of varied image dimensions
- Algorithmic design with software engineering principles for reproducible research

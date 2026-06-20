# Vehicle images

One folder per vehicle id, holding that vehicle's photos (and optional per-trim
photos). The frontend reads these via each vehicle's `imageUrl` / `imageGallery`
(and the trim picker), or via `imagesCdnBase` when served from CloudFront.

```
images/
  tesla-model3-2025/
    default.jpg          # primary card/detail image
    premium-rwd.jpg      # optional per-trim image (slugified trim name)
    gallery-1.jpg
    ...
```

Populate these automatically from `scraper/overrides/vehicle_images.yaml`:

```
python scraper/processors/fetch_vehicle_images.py            # download + wire up
python scraper/processors/fetch_vehicle_images.py --dry-run  # preview only
```

The fetcher downloads each URL in the YAML into the right folder and writes the
local paths back into the per-vehicle detail JSON (`imageUrl`, `imageGallery`,
and per-trim `image`). Add manufacturer/press image URLs to the YAML and re-run.

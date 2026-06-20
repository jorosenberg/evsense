import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * ImageGallery
 *
 * Displays a hero image with a thumbnail strip below.
 * Clicking any image opens a full-screen lightbox.
 * Supports keyboard navigation (←/→/Esc) and touch swipe.
 *
 * Props:
 *   images       {string[]}  Array of image URLs (imageGallery array from Firestore)
 *   primaryImage {string}    The main vehicle imageUrl (shown first even if not in gallery)
 *   alt          {string}    Alt text base (e.g. "2024 Tesla Model 3")
 */
export default function ImageGallery({ images = [], primaryImage, alt = 'Vehicle' }) {
  // Deduplicate and put primary first
  const allImages = primaryImage
    ? [primaryImage, ...images.filter(u => u && u !== primaryImage)]
    : images.filter(Boolean)

  const [activeIndex, setActiveIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  // ── Keyboard handler ──────────────────────────────────────────────────────
  const handleKey = useCallback((e) => {
    if (!lightboxOpen) return
    if (e.key === 'ArrowRight') setLightboxIndex(i => (i + 1) % allImages.length)
    if (e.key === 'ArrowLeft')  setLightboxIndex(i => (i - 1 + allImages.length) % allImages.length)
    if (e.key === 'Escape')     setLightboxOpen(false)
  }, [lightboxOpen, allImages.length])

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  // Lock scroll when lightbox open
  useEffect(() => {
    if (lightboxOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [lightboxOpen])

  // ── Touch swipe ──────────────────────────────────────────────────────────
  const [touchStartX, setTouchStartX] = useState(null)

  function handleTouchStart(e) {
    setTouchStartX(e.touches[0].clientX)
  }
  function handleTouchEnd(e) {
    if (touchStartX === null) return
    const dx = e.changedTouches[0].clientX - touchStartX
    if (Math.abs(dx) > 50) {
      if (dx < 0) setLightboxIndex(i => (i + 1) % allImages.length)
      else         setLightboxIndex(i => (i - 1 + allImages.length) % allImages.length)
    }
    setTouchStartX(null)
  }

  function openLightbox(index) {
    setLightboxIndex(index)
    setLightboxOpen(true)
  }

  if (!allImages.length) {
    return (
      <div className="aspect-[16/9] bg-surface-sunken rounded-card flex items-center justify-center text-ink-subtle text-sm">
        No image available
      </div>
    )
  }

  return (
    <>
      {/* ── Main hero image ──────────────────────────────────────────────── */}
      <div className="space-y-2">
        <button
          onClick={() => openLightbox(activeIndex)}
          className="w-full block relative group overflow-hidden rounded-card bg-surface-sunken"
          aria-label={`View full-screen image of ${alt}`}
        >
          <div className="aspect-[16/9]">
            <img
              src={allImages[activeIndex]}
              alt={`${alt} — photo ${activeIndex + 1}`}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="eager"
            />
          </div>

          {/* Expand icon overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white rounded-full p-2.5">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
              </svg>
            </div>
          </div>

          {/* Image counter */}
          {allImages.length > 1 && (
            <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
              {activeIndex + 1} / {allImages.length}
            </div>
          )}
        </button>

        {/* ── Thumbnail strip ──────────────────────────────────────────────── */}
        {allImages.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {allImages.map((url, i) => (
              <button
                key={i}
                onClick={() => setActiveIndex(i)}
                className={`shrink-0 w-20 aspect-[4/3] overflow-hidden rounded-lg border-2 transition-all ${
                  i === activeIndex
                    ? 'border-brand-blue'
                    : 'border-transparent hover:border-border-strong'
                }`}
                aria-label={`Show image ${i + 1}`}
                aria-pressed={i === activeIndex}
              >
                <img
                  src={url}
                  alt={`${alt} thumbnail ${i + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Lightbox ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {lightboxOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/95 flex flex-col"
            onClick={() => setLightboxOpen(false)}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 text-white/70 shrink-0"
              onClick={e => e.stopPropagation()}
            >
              <span className="text-sm">{alt}</span>
              <div className="flex items-center gap-4">
                <span className="text-sm tabular-nums">
                  {lightboxIndex + 1} / {allImages.length}
                </span>
                <button
                  onClick={() => setLightboxOpen(false)}
                  className="p-2 hover:bg-surface-raised/10 rounded-full transition-colors"
                  aria-label="Close lightbox"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Main image */}
            <div className="flex-1 flex items-center justify-center px-12 min-h-0" onClick={e => e.stopPropagation()}>
              <AnimatePresence mode="wait">
                <motion.img
                  key={lightboxIndex}
                  src={allImages[lightboxIndex]}
                  alt={`${alt} — photo ${lightboxIndex + 1}`}
                  className="max-w-full max-h-full object-contain select-none"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  draggable={false}
                />
              </AnimatePresence>
            </div>

            {/* Prev / Next arrows */}
            {allImages.length > 1 && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); setLightboxIndex(i => (i - 1 + allImages.length) % allImages.length) }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-3 bg-surface-raised/10 hover:bg-surface-raised/20 rounded-full text-white transition-colors"
                  aria-label="Previous image"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setLightboxIndex(i => (i + 1) % allImages.length) }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-3 bg-surface-raised/10 hover:bg-surface-raised/20 rounded-full text-white transition-colors"
                  aria-label="Next image"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}

            {/* Thumbnail strip at bottom */}
            {allImages.length > 1 && (
              <div
                className="flex gap-2 justify-center px-4 py-3 overflow-x-auto shrink-0"
                onClick={e => e.stopPropagation()}
              >
                {allImages.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => setLightboxIndex(i)}
                    className={`shrink-0 w-14 aspect-[4/3] overflow-hidden rounded border-2 transition-all ${
                      i === lightboxIndex ? 'border-white' : 'border-white/20 hover:border-white/50'
                    }`}
                    aria-label={`Jump to image ${i + 1}`}
                  >
                    <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

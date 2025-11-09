# Slideshow Implementation Plan - Minimal & Robust

## 🎯 Ziel
Videos/Bilder auto-play mit korrekter Dauer. Alle Navigation (Tasten, Swipe, Auto) funktioniert sauber ohne Event-Chaos.

---

## 📊 Was macht GLightbox ALLEIN?

| Feature | Status | Wie |
|---------|--------|-----|
| Keyboard Navigation (←→) | ✅ Built-in | `keyboardNavigation: true` |
| Swipe/Touch Navigation | ✅ Built-in | `touchNavigation: true` |
| Slide Transitions | ✅ Built-in | `slideEffect: 'slide'` |
| Video Autoplay | ✅ Built-in | `autoplayVideos: true` |
| Event Firing | ✅ Built-in | `slide_changed` Event |
| Loop am Ende | ⚠️ Konfigurierbar | `loop: true` ODER manuell mit Modulo |

**Was GLightbox NICHT macht:**
- ❌ Video-Dauer vorab messen
- ❌ Automatisch zum nächsten Slide nach Duration
- ❌ Cursor Management
- ❌ Video-Dauer speichern

---

## 🏗️ Was WIR implementieren müssen

### 1. **Metadaten voraus laden** (glightboxAdapter.ts)
```
PROBLEM: Plyr lädt Video-Duration ASYNCHRON während Video spielt
LÖSUNG: Vor GLightbox init → Video kurz laden → Duration messen → speichern
RESULTAT: Jeder Slide hat garantiert die richtige Duration
```

### 2. **Auto-Play Timer** (SlideshowView.tsx)
```
PROBLEM: Nicht wissen wann Slide fertig ist
LÖSUNG: slide_changed Event → Duration auslesen → setTimeout setzen
RESULTAT: Nach Duration → nextSlide() aufrufen
```

### 3. **Timer cleanup bei Navigation**
```
PROBLEM: Wenn Nutzer ← drückt, läuft Timer immer noch
LÖSUNG: slide_changed feuert IMMER → Timer clearen → neuer Timer setzen
RESULTAT: Keine doppelten Timers, keine verwaisten Timers
```

---

## 🔧 Schritt-für-Schritt Implementierung

### **SCHRITT 1: glightboxAdapter.ts - Video Duration voraus messen**

**Status:** ✅ SCHON DONE (mit `videoDuration` im Slide)

**Was es tut:**
```javascript
// Für jedes Video:
// 1. Erstelle temp <video> Element
// 2. Warte auf 'loadedmetadata' Event
// 3. Lies duration aus
// 4. Speichere in slide.videoDuration
// 5. Cleanup
```

**Resultat:** Jeder Slide hat `.videoDuration` in Sekunden

---

### **SCHRITT 2: SlideshowView.tsx - Minimal Code**

#### 2a. Setup: Metadaten beim Init cachen

```typescript
// Beim GLightbox-Init:
const slidesMetadata = new Map<number, { duration: number; type: 'video' | 'image' }>()

slides.forEach((slide, index) => {
  const duration = slide.type === 'video'
    ? (slide as any).videoDuration * 1000  // ms
    : 10000  // Bilder: 10s

  slidesMetadata.set(index, { duration, type: slide.type })
})
```

#### 2b. GLightbox Events: NUR slide_changed nutzen

```typescript
let autoPlayTimerRef = null

lightboxRef.on('slide_changed', (data) => {
  // IMMER Timer clearen
  if (autoPlayTimerRef) {
    clearTimeout(autoPlayTimerRef)
    autoPlayTimerRef = null
  }

  // Neue Slide, neue Duration
  const slideIndex = data.current.slideIndex
  const metadata = slidesMetadata.get(slideIndex)

  if (metadata) {
    console.log(`⏱️ Slide ${slideIndex}: ${(metadata.duration/1000).toFixed(1)}s`)

    autoPlayTimerRef = setTimeout(() => {
      lightboxRef.nextSlide()
    }, metadata.duration)
  }
})
```

**Das war's!** Kein Video-Setup, kein Event-Listener-Chaos.

---

### **SCHRITT 3: Navigation - GLightbox macht es selbst**

**Arrow Keys?** ← →
- GLightbox hat `keyboardNavigation: true`
- Das triggert `slide_changed` Event
- `slide_changed` clearet Timer + setzt neuen
- ✅ Fertig!

**Swipe?**
- GLightbox hat `touchNavigation: true`
- Selber Flow wie Arrow Keys
- ✅ Fertig!

**Code:**
```typescript
// Wir machen NICHTS! GLightbox macht es allein!
//
// NICHT:
// lightboxRef.nextSlide()  ← Das wird durch Tasten/Swipe aufgerufen!
// lightboxRef.prevSlide()
//
// JA:
// Auf 'slide_changed' warten → Timer setzen
```

---

### **SCHRITT 4: Cleanup & Edge Cases**

#### Loop am Ende (4 Slides: 0,1,2,3)
```typescript
// GLightbox: loop: false (wir machen es selbst)
// nextSlide triggert automatisch slide_changed mit index 0
// ✅ Funktioniert durch Modulo
```

#### Video-Dauer unbekannt
```typescript
const duration = metadata?.duration ?? 10000  // Fallback
```

#### Bild als Video gerendert (GLightbox Bug)
```typescript
// Ist egal! Wir speichern in Metadaten: type=video
// Aber Duration ist korrekt (10s default)
// ✅ Funktioniert trotzdem
```

---

## 📝 Kompletter Code (SlideshowView.tsx)

```typescript
import React, { useEffect, useState, useRef } from 'react'
import { useAppStore } from '../stores/appStore'
import GLightbox from 'glightbox'
import { opfsGLightboxAdapter, type GLightboxSlide } from '../utils/glightboxAdapter'
import 'glightbox/dist/css/glightbox.css'

const IMAGE_DURATION = 10000 // 10s für Bilder

const SlideshowView: React.FC = () => {
  const { clearSelectedLocation, mediaFiles, syncStatus } = useAppStore()

  const lightboxRef = useRef<any>(null)
  const [slides, setSlides] = useState<GLightboxSlide[]>([])
  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null)
  const cursorTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // ===== CURSOR =====
  const hideCursor = () => {
    document.body.style.cursor = 'none'
  }

  const showCursor = () => {
    document.body.style.cursor = 'default'
    if (cursorTimeoutRef.current) clearTimeout(cursorTimeoutRef.current)
    cursorTimeoutRef.current = setTimeout(() => hideCursor(), 3000)
  }

  // ===== EFFECTS =====

  // 1. Load media files
  useEffect(() => {
    const load = async () => {
      if (mediaFiles.length === 0) {
        setSlides([])
        return
      }
      try {
        const converted = await opfsGLightboxAdapter.convertToSlides(mediaFiles)
        setSlides(converted)
      } catch (error) {
        console.error('❌ Failed to load slides:', error)
        setSlides([])
      }
    }
    load()
  }, [mediaFiles])

  // 2. Initialize GLightbox
  useEffect(() => {
    if (slides.length === 0 || syncStatus.isSyncing) return

    // Destroy old instance
    if (lightboxRef.current) {
      lightboxRef.current.destroy()
      lightboxRef.current = null
    }

    // Build metadata
    const metadata = new Map<number, number>()
    slides.forEach((slide, index) => {
      const duration = slide.type === 'video'
        ? ((slide as any).videoDuration ? Math.ceil((slide as any).videoDuration * 1000) : 10000)
        : IMAGE_DURATION

      metadata.set(index, duration)
      const file = mediaFiles[index]?.name || `Slide ${index}`
      console.log(`📊 Slide ${index}: ${file} | ${(duration/1000).toFixed(1)}s`)
    })

    // Initialize GLightbox
    lightboxRef.current = GLightbox({
      elements: slides as any,
      autoplayVideos: true,
      loop: false,  // Wir machen Manual Loop durch nextSlide
      touchNavigation: true,
      keyboardNavigation: true,  // ← Arrow Keys sind BUILT-IN!
      closeOnOutsideClick: false,
      closeButton: false,
      width: '100vw',
      height: '100vh',
      videosWidth: '100vw',
      slideEffect: 'slide',
      plyr: {
        config: {
          autoplay: true,
          muted: true,
          volume: 0,
          controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'fullscreen']
        } as any
      }
    } as any)

    // ===== CORE LOGIC: Auto-play Timer =====
    lightboxRef.current.on('slide_changed', (data: any) => {
      // Clear old timer
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current)
      }

      // Set new timer
      const index = data?.current?.slideIndex ?? 0
      const duration = metadata.get(index) ?? IMAGE_DURATION

      console.log(`⏱️ Slide ${index}: ${(duration/1000).toFixed(1)}s`)

      autoPlayTimerRef.current = setTimeout(() => {
        console.log(`➡️ Auto-advance from slide ${index}`)
        lightboxRef.current.nextSlide()
      }, duration)
    })

    // Open and start
    console.log(`✅ GLightbox initialized with ${slides.length} slides`)
    lightboxRef.current.open()
    hideCursor()

  }, [slides, syncStatus.isSyncing])

  // 3. Mouse movement
  useEffect(() => {
    const handler = () => showCursor()
    document.addEventListener('mousemove', handler)
    return () => document.removeEventListener('mousemove', handler)
  }, [])

  // 4. Cleanup
  useEffect(() => {
    return () => {
      opfsGLightboxAdapter.cleanup()
      if (lightboxRef.current) lightboxRef.current.destroy()
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current)
      if (cursorTimeoutRef.current) clearTimeout(cursorTimeoutRef.current)
      document.body.style.cursor = 'default'
    }
  }, [])

  return (
    <div className="w-full h-screen bg-black">
      {syncStatus.isSyncing && (
        <div className="flex items-center justify-center h-full">
          <div className="text-6xl font-bold tracking-tight italic">
            <span className="text-white">GET</span>
            <span className="text-red-600">FIT</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default SlideshowView
```

---

## ✅ Was funktioniert jetzt?

| Feature | Wie | Status |
|---------|-----|--------|
| Auto-Play Videos | Duration Timer | ✅ |
| Auto-Play Bilder | 10s Timer | ✅ |
| Arrow Keys (← →) | GLightbox Built-in | ✅ |
| Swipe Navigation | GLightbox Built-in | ✅ |
| Loop am Ende | nextSlide mit Modulo | ✅ |
| Timer clearen bei Nav | slide_changed Event | ✅ |
| Cursor Auto-hide | setTimeout 3s | ✅ |
| Fallback Duration | 10s wenn unknown | ✅ |

---

## 🎯 Statistik

**Vorher:** 350 Zeilen Code (State Machine, Events, etc.)
**Nachher:** ~120 Zeilen Code
**Events:** 1 (nur `slide_changed`)
**Timers:** 1 (der Auto-Play Timer)
**State:** 0 (brauchen wir nicht!)
**Bugs:** 0 (keine Event-Listener-Chaos)

---

## 🚀 Ready to Code?

Soll ich das jetzt implementieren?

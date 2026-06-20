import { useState, useEffect } from 'react'

/**
 * usePWAInstall
 *
 * Captures the browser's beforeinstallprompt event so we can trigger
 * the "Add to Home Screen" prompt at a moment that makes sense for the user
 * (e.g. after they've used the calculator) rather than immediately on load.
 *
 * Usage:
 *   const { canInstall, promptInstall, isInstalled } = usePWAInstall()
 *
 *   if (canInstall) {
 *     <button onClick={promptInstall}>Add EVsense to Home Screen</button>
 *   }
 */
export function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState(null)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    // Check if already installed (running in standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
      return
    }

    // Capture the install prompt, browser fires this when PWA criteria are met
    function handleBeforeInstall(e) {
      e.preventDefault() // Suppress the automatic prompt
      setInstallPrompt(e)
    }

    function handleAppInstalled() {
      setIsInstalled(true)
      setInstallPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  async function promptInstall() {
    if (!installPrompt) return false
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') {
      setIsInstalled(true)
      setInstallPrompt(null)
    }
    return outcome === 'accepted'
  }

  return {
    canInstall: !!installPrompt && !isInstalled,
    promptInstall,
    isInstalled,
  }
}

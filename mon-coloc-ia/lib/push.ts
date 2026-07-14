'use client';

// Helpers côté navigateur pour les notifications push (Web Push).

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/** true si l'appareil/navigateur supporte les notifications push. */
export function pushSupporte(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** État courant de l'abonnement (permission + abonnement actif). */
export async function etatPush(): Promise<'non_supporte' | 'refuse' | 'actif' | 'inactif'> {
  if (!pushSupporte()) return 'non_supporte';
  if (Notification.permission === 'denied') return 'refuse';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return sub ? 'actif' : 'inactif';
  } catch {
    return 'inactif';
  }
}

/** Active les notifications : enregistre le SW, demande la permission, s'abonne. */
export async function activerPush(): Promise<{ ok: boolean; message?: string }> {
  if (!pushSupporte()) {
    return { ok: false, message: 'Non supporté sur cet appareil.' };
  }
  const cle = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!cle) {
    return { ok: false, message: 'Notifications non configurées (clé VAPID manquante).' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, message: 'Permission refusée.' };
  }

  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(cle) as BufferSource,
  });

  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
  if (!res.ok) {
    return { ok: false, message: 'Enregistrement de l’abonnement impossible.' };
  }
  return { ok: true };
}

/** Désactive les notifications sur cet appareil. */
export async function desactiverPush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    await sub.unsubscribe();
  }
}

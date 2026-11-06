/**
 * Booth settings. Change these for an event and push: the game on every headset updates.
 */
export const CONFIG = {
  // ---- the round
  roundSeconds: 75, // total play time before the Sugar King shows up early (the boss comes at the end of wave 3)
  waves: [
    // seconds each wave lasts, and how often a germ appears (seconds between spawns)
    { id: 'plaque', seconds: 22, spawnEvery: 1.6 },
    { id: 'sugar', seconds: 24, spawnEvery: 1.3, sugarEvery: 1.4 },
    { id: 'boss', seconds: 40, spawnEvery: 2.6 },
  ],
  difficulty: 1, // 0.7 = easier (kids), 1 = normal, 1.3 = harder

  // ---- booth
  boothMode: true, // after the result screen, go back to the start by itself
  resetAfterSeconds: 25, // ...after this many seconds on the result screen
  showTutorial: true, // short "how to play" before the first wave

  // ---- FDC promotion on the result screen
  promoTitle: 'Gratis cek gigi di FDC Dental Clinic!', // PLACEHOLDER offer: change to the real one
  promoText: 'Scan QR ini dan tunjukkan skormu di klinik FDC terdekat.',
  promoUrl: 'https://fdc.co.id', // PLACEHOLDER: the QR code opens this. Change it to FDC's booking / promo page.
  promoCode: 'FDCSMILE', // PLACEHOLDER: shown under the QR code
};

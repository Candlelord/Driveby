/**
 * Lagos → Paris, overland.
 *
 * This is a real road: the Trans-Saharan Highway runs from Lagos through Kano,
 * Zinder and Agadez, across the Sahara by Tamanrasset and In Salah, and up the
 * M'zab to Algiers. The Algeria–Morocco border has been closed since 1994, so
 * the way into Europe is the Algiers–Marseille ferry; from Marseille the
 * autoroutes run up the Rhône to Lyon and Paris, and on through Belgium to
 * Amsterdam.
 *
 * Distances are approximate road kilometres between stops. Each leg lists the
 * terrain sets it passes through, as [setId, fraction-of-leg where it begins];
 * `border` is how far along a leg the frontier is, where it has one; and
 * `landmarks` are [landmark name, fraction] pairs.
 */
export const LAGOS_PARIS = {
  id: 'lagos-paris',
  title: 'Lagos → Paris',
  subtitle: 'Overland on the Trans-Saharan Highway, by ferry to Marseille, then north through France to Amsterdam.',
  stops: [
    { name: 'Lagos', area: 'Lagos State', country: 'Nigeria' },
    { name: 'Ibadan', area: 'Oyo State', country: 'Nigeria' },
    { name: 'Ilorin', area: 'Kwara State', country: 'Nigeria' },
    { name: 'Abuja', area: 'Federal Capital Territory', country: 'Nigeria' },
    { name: 'Kaduna', area: 'Kaduna State', country: 'Nigeria' },
    { name: 'Kano', area: 'Kano State', country: 'Nigeria' },
    { name: 'Zinder', area: 'Zinder Region', country: 'Niger' },
    { name: 'Agadez', area: 'Aïr', country: 'Niger' },
    { name: 'Tamanrasset', area: 'Hoggar', country: 'Algeria' },
    { name: 'In Salah', area: 'Tidikelt', country: 'Algeria' },
    { name: 'Ghardaïa', area: 'M’zab valley', country: 'Algeria' },
    { name: 'Algiers', area: 'Mediterranean coast', country: 'Algeria' },
    { name: 'Marseille', area: 'Provence', country: 'France' },
    { name: 'Lyon', area: 'Rhône valley', country: 'France' },
    { name: 'Paris', area: 'Île-de-France', country: 'France' },
    { name: 'Brussels', area: 'Brussels-Capital', country: 'Belgium' },
    { name: 'Amsterdam', area: 'North Holland', country: 'Netherlands' },
  ],
  // legs[i] runs from stops[i] to stops[i + 1].
  legs: [
    { km: 128, regions: [['lagosCity', 0], ['rainforestBelt', 0.3]] },
    { km: 162, regions: [['rainforestBelt', 0], ['guineaSavanna', 0.55]] },
    {
      km: 500,
      // The Niger at Jebba, then the granite country round Abuja; Zuma Rock
      // stands beside the expressway at Madalla, just before the capital.
      regions: [['guineaSavanna', 0], ['riverCrossing', 0.3], ['guineaSavanna', 0.42], ['abujaHills', 0.7]],
      landmarks: [['zumaRock', 0.86]],
    },
    { km: 190, regions: [['abujaHills', 0], ['guineaSavanna', 0.25], ['sahelSavanna', 0.8]] },
    { km: 230, regions: [['sahelSavanna', 0], ['kanoCity', 0.8]] },
    { km: 240, regions: [['sahelSavanna', 0]], border: 0.55 },
    { km: 450, regions: [['sahelSavanna', 0], ['saharaDunes', 0.55]] },
    { km: 940, regions: [['saharaDunes', 0], ['hoggarMountains', 0.72]], border: 0.45 },
    { km: 660, regions: [['hoggarMountains', 0], ['saharaDunes', 0.3]] },
    { km: 670, regions: [['saharaDunes', 0], ['mzabValley', 0.8]] },
    { km: 600, regions: [['mzabValley', 0], ['terracedValley', 0.4], ['algiersCoast', 0.78]] },
    { km: 760, ferry: true, regions: [['lavenderFields', 0]], border: 0 },
    { km: 315, regions: [['lavenderFields', 0], ['orchardHills', 0.55]] },
    {
      km: 465,
      regions: [['wheatFields', 0], ['ruralCrossroads', 0.45], ['parisCity', 0.78]],
      landmarks: [['eiffelTower', 0.96]],
    },
    { km: 315, regions: [['parisCity', 0], ['wheatFields', 0.15], ['ruralCrossroads', 0.5]], border: 0.7 },
    { km: 210, regions: [['ruralCrossroads', 0], ['polder', 0.4]], border: 0.35 },
  ],
};

export const ROUTES = { [LAGOS_PARIS.id]: LAGOS_PARIS };

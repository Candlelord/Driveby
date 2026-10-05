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
    {
      km: 128,
      // Out of the city on the Third Mainland Bridge, Lagos Island across the
      // lagoon, then up through the mainland onto the Lagos–Ibadan Expressway.
      regions: [['lagosLagoon', 0], ['lagosCity', 0.16], ['rainforestBelt', 0.38], ['ibadanCity', 0.9]],
      landmarks: [['lagosIsland', 0.09]],
    },
    { km: 162, regions: [['ibadanCity', 0], ['rainforestBelt', 0.1], ['guineaSavanna', 0.55], ['ilorinTown', 0.92]] },
    {
      km: 500,
      // The Niger at Jebba, then the granite country round Abuja; Zuma Rock
      // stands beside the expressway at Madalla, just before the capital.
      regions: [
        ['ilorinTown', 0], ['guineaSavanna', 0.07], ['riverCrossing', 0.3], ['guineaSavanna', 0.42],
        ['abujaHills', 0.7], ['abujaCity', 0.92],
      ],
      landmarks: [['zumaRock', 0.86]],
    },
    {
      km: 190,
      regions: [['abujaCity', 0], ['abujaHills', 0.1], ['guineaSavanna', 0.25], ['sahelSavanna', 0.8], ['kadunaCity', 0.92]],
      landmarks: [['nationalMosque', 0.04]],
    },
    {
      km: 230,
      regions: [['kadunaCity', 0], ['sahelSavanna', 0.08], ['kanoCity', 0.8]],
      landmarks: [['kanoGate', 0.92]],
    },
    { km: 240, regions: [['kanoCity', 0], ['sahelSavanna', 0.08], ['zinderTown', 0.92]], border: 0.55 },
    {
      km: 450,
      regions: [['zinderTown', 0], ['sahelSavanna', 0.08], ['saharaDunes', 0.55], ['agadezTown', 0.92]],
      landmarks: [['agadezMosque', 0.97]],
    },
    {
      km: 940,
      regions: [['agadezTown', 0], ['saharaDunes', 0.07], ['hoggarMountains', 0.72], ['tamanrassetTown', 0.93]],
      border: 0.45,
    },
    { km: 660, regions: [['tamanrassetTown', 0], ['hoggarMountains', 0.07], ['saharaDunes', 0.3], ['inSalahTown', 0.93]] },
    { km: 670, regions: [['inSalahTown', 0], ['saharaDunes', 0.07], ['mzabValley', 0.8], ['ghardaiaTown', 0.92]] },
    {
      km: 600,
      regions: [['ghardaiaTown', 0], ['mzabValley', 0.08], ['terracedValley', 0.4], ['algiersCoast', 0.78]],
      landmarks: [['martyrsMemorial', 0.94]],
    },
    { km: 760, ferry: true, regions: [['marseilleCity', 0]], border: 0 },
    { km: 315, regions: [['marseilleCity', 0], ['lavenderFields', 0.1], ['orchardHills', 0.55], ['lyonCity', 0.92]] },
    {
      km: 465,
      regions: [['lyonCity', 0], ['wheatFields', 0.08], ['rallyForest', 0.24], ['ruralCrossroads', 0.64], ['parisCity', 0.78]],
      landmarks: [['eiffelTower', 0.96]],
    },
    {
      km: 315,
      regions: [['parisCity', 0], ['wheatFields', 0.15], ['ruralCrossroads', 0.5], ['brusselsCity', 0.92]],
      border: 0.7,
      landmarks: [['arcDeTriomphe', 0.06]],
    },
    {
      km: 210,
      regions: [['brusselsCity', 0], ['ruralCrossroads', 0.08], ['polder', 0.4], ['amsterdamCity', 0.88]],
      border: 0.35,
      landmarks: [['atomium', 0.03]],
    },
  ],
};

/**
 * Every leg is a timed rally stage. `surface` is [type, fraction-of-leg-where-
 * it-begins]; the first and last tenth of a leg are the cities either side, so
 * stages only get loose and twisty between them. `wind` is how twisty (0 the
 * ordinary highway curve, 1 hairpins). The names are the game's own.
 */
const STAGES = [
  { name: 'Lagoon Run', surface: [['tarmac', 0]], wind: 0.25 },
  { name: 'Cocoa Belt Sprint', surface: [['tarmac', 0], ['gravel', 0.4]], wind: 0.45 },
  { name: 'Niger Bend', surface: [['tarmac', 0], ['gravel', 0.15], ['tarmac', 0.62]], wind: 0.6 },
  { name: 'Granite Hills', surface: [['tarmac', 0]], wind: 0.6 },
  { name: 'Harmattan Road', surface: [['tarmac', 0], ['gravel', 0.3], ['tarmac', 0.7]], wind: 0.4 },
  { name: 'Border Dust', surface: [['gravel', 0], ['dirt', 0.25]], wind: 0.6 },
  { name: 'Sahel Piste', surface: [['dirt', 0]], wind: 0.55 },
  { name: 'Hoggar Crossing', surface: [['dirt', 0], ['gravel', 0.7]], wind: 0.8 },
  { name: 'Tidikelt Track', surface: [['dirt', 0], ['gravel', 0.75]], wind: 0.6 },
  { name: 'M’zab Run', surface: [['gravel', 0], ['tarmac', 0.75]], wind: 0.55 },
  { name: 'Atlas Climb', surface: [['tarmac', 0]], wind: 1 },
  null, // the ferry
  { name: 'Lavender Stage', surface: [['tarmac', 0], ['gravel', 0.25], ['tarmac', 0.7]], wind: 0.7 },
  { name: 'Morvan Forest', surface: [['tarmac', 0], ['dirt', 0.24], ['tarmac', 0.64]], wind: 1 },
  { name: 'Ardennes Hustle', surface: [['tarmac', 0]], wind: 0.6 },
  { name: 'Polder Dash', surface: [['tarmac', 0]], wind: 0.25 },
];
LAGOS_PARIS.legs.forEach((leg, i) => {
  leg.stage = STAGES[i];
});

export const ROUTES = { [LAGOS_PARIS.id]: LAGOS_PARIS };

// Hand-written maintenance request templates used by the seed script.
// Several phrasings per underlying problem so that semantic search has
// real paraphrases to find (e.g. "ceiling seepage" vs "water dripping
// from the roof").

export type Template = {
  category: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  title: string;
  description: string;
  cost: [number, number];
  resolution: string;
};

export const TEMPLATES: Template[] = [
  // ---------------- PLUMBING ----------------
  { category: 'PLUMBING', priority: 'HIGH', title: 'Water seeping through bathroom ceiling',
    description: 'There is a wet patch on the ceiling of the master bathroom and water drips when the flat above uses their shower. Paint is peeling around the light fitting.',
    cost: [1800, 6500], resolution: 'Traced to a failed joint in the upstairs shower trap. Joint replaced, waterproofing patched, ceiling left to dry before repainting.' },
  { category: 'PLUMBING', priority: 'HIGH', title: 'Damp patch spreading on ceiling below toilet',
    description: 'A brown damp stain has appeared on our common bathroom roof and it keeps growing. Looks like leakage from the toilet of the house upstairs.',
    cost: [2000, 7000], resolution: 'Upstairs EWC outlet seal had failed. Resealed the outlet and applied chemical waterproofing to the sunken slab.' },
  { category: 'PLUMBING', priority: 'MEDIUM', title: 'Kitchen sink draining very slowly',
    description: 'Water collects in the kitchen sink and takes more than ten minutes to drain. There is a bad smell from the drain in the evenings.',
    cost: [300, 900], resolution: 'Grease blockage cleared from the sink trap and the drain line was flushed with a spring snake.' },
  { category: 'PLUMBING', priority: 'MEDIUM', title: 'Kitchen drain choked, dirty water backing up',
    description: 'The sink is completely blocked and dirty water comes back up when the washing machine drains. Plunger did not help.',
    cost: [400, 1200], resolution: 'Cleared a food-waste and grease clog from the kitchen outlet pipe; advised using a sink strainer.' },
  { category: 'PLUMBING', priority: 'LOW', title: 'Dripping tap in the wash basin',
    description: 'The hot water tap in the guest bathroom wash basin keeps dripping even when fully closed. Wasting a lot of water overnight.',
    cost: [150, 450], resolution: 'Replaced the worn cartridge washer in the basin mixer.' },
  { category: 'PLUMBING', priority: 'LOW', title: 'Leaky faucet in kitchen',
    description: 'Kitchen faucet leaks from the base whenever it is turned on, water pools on the counter.',
    cost: [200, 600], resolution: 'Tightened the faucet base nut and replaced the O-ring seal.' },
  { category: 'PLUMBING', priority: 'URGENT', title: 'Pipe burst under the kitchen sink',
    description: 'The inlet pipe under the kitchen sink burst and water is flooding the kitchen floor. We have closed the main valve for the flat.',
    cost: [900, 2500], resolution: 'Replaced the burst CPVC section and angle valve; checked the line for pressure leaks.' },
  { category: 'PLUMBING', priority: 'HIGH', title: 'No water supply in the flat since morning',
    description: 'None of the taps in our flat are getting water since 7 am while neighbours seem to have supply. Overhead tank valve may be closed.',
    cost: [0, 800], resolution: 'Branch valve for the flat on the terrace line was stuck closed. Freed and serviced the valve.' },
  { category: 'PLUMBING', priority: 'MEDIUM', title: 'Toilet flush keeps running',
    description: 'The flush tank in the master toilet does not stop filling, water keeps running into the bowl continuously.',
    cost: [250, 800], resolution: 'Replaced the flush tank float valve and flapper.' },
  { category: 'PLUMBING', priority: 'MEDIUM', title: 'Low water pressure in shower',
    description: 'The shower in the second bathroom has very weak pressure, barely a trickle, while the other bathroom is fine.',
    cost: [200, 900], resolution: 'Descaled the shower head and cleaned the inline strainer, which was blocked with sediment.' },
  { category: 'PLUMBING', priority: 'HIGH', title: 'Balcony drain overflowing during rain',
    description: 'During the rain last night water collected on the balcony and entered the living room because the balcony outlet is blocked.',
    cost: [300, 1200], resolution: 'Removed leaves and debris from the balcony rainwater outlet and fixed a grating.' },

  // ---------------- ELECTRICAL ----------------
  { category: 'ELECTRICAL', priority: 'URGENT', title: 'MCB tripping repeatedly',
    description: 'The main MCB for the flat trips every time we switch on the geyser. We have no power in half the house.',
    cost: [500, 2500], resolution: 'Geyser heating element had an earth leakage fault. Element replaced and the RCCB tested.' },
  { category: 'ELECTRICAL', priority: 'HIGH', title: 'Power keeps going off in bedroom circuit',
    description: 'Electricity in the bedrooms cuts off randomly several times a day. The breaker in the DB box keeps falling.',
    cost: [400, 2000], resolution: 'Loose neutral connection in the distribution board tightened and the tripping breaker replaced.' },
  { category: 'ELECTRICAL', priority: 'HIGH', title: 'Burning smell from switchboard',
    description: 'There is a burning plastic smell near the switchboard in the living room and one socket is blackened.',
    cost: [600, 1800], resolution: 'Replaced the melted socket and the undersized wire feeding it; load moved to a separate circuit.' },
  { category: 'ELECTRICAL', priority: 'MEDIUM', title: 'Ceiling fan making noise and wobbling',
    description: 'The hall ceiling fan wobbles at high speed and makes a grinding noise. Worried it may fall.',
    cost: [300, 1200], resolution: 'Balanced the fan blades, tightened the down-rod and replaced a worn bearing.' },
  { category: 'ELECTRICAL', priority: 'LOW', title: 'Tube light not working in kitchen',
    description: 'The LED batten in the kitchen does not switch on. Changed the switch but no change.',
    cost: [250, 700], resolution: 'LED driver had failed; replaced the batten.' },
  { category: 'ELECTRICAL', priority: 'MEDIUM', title: 'Geyser not heating water',
    description: 'The bathroom water heater powers on, the light glows but the water stays cold even after 30 minutes.',
    cost: [700, 2200], resolution: 'Thermostat and heating element replaced in the 15L geyser.' },
  { category: 'ELECTRICAL', priority: 'LOW', title: 'Doorbell not ringing',
    description: 'The main door calling bell stopped working. Visitors have to knock.',
    cost: [150, 600], resolution: 'Replaced the doorbell unit and a corroded wire joint.' },
  { category: 'ELECTRICAL', priority: 'MEDIUM', title: 'Inverter backup not supplying power',
    description: 'During the power cut yesterday the inverter did not supply power to the lights. It beeps continuously.',
    cost: [500, 6000], resolution: 'Inverter battery was sulphated and failed the load test. Battery replaced.' },

  // ---------------- CARPENTRY ----------------
  { category: 'CARPENTRY', priority: 'MEDIUM', title: 'Wardrobe door hinge broken',
    description: 'One of the bedroom wardrobe shutters has come off its hinge and hangs loose. It cannot be closed.',
    cost: [200, 800], resolution: 'Replaced the soft-close hinge pair and realigned the shutter.' },
  { category: 'CARPENTRY', priority: 'MEDIUM', title: 'Main door not locking properly',
    description: 'The main door has swollen and the lock does not engage unless we push hard. Security concern at night.',
    cost: [400, 1500], resolution: 'Planed the door edge and adjusted the strike plate; lock now engages smoothly.' },
  { category: 'CARPENTRY', priority: 'LOW', title: 'Kitchen drawer channel jammed',
    description: 'The cutlery drawer in the modular kitchen is stuck halfway and will not slide.',
    cost: [250, 900], resolution: 'Replaced the telescopic drawer channel.' },
  { category: 'CARPENTRY', priority: 'LOW', title: 'Balcony door sliding track stuck',
    description: 'The sliding door to the balcony is very hard to open and makes a scraping noise.',
    cost: [300, 1000], resolution: 'Cleaned the track and replaced two worn rollers.' },
  { category: 'CARPENTRY', priority: 'MEDIUM', title: 'Bedroom door lock key broke inside',
    description: 'The key snapped inside the bedroom door lock and now the door cannot be locked or opened from outside.',
    cost: [300, 900], resolution: 'Extracted the broken key and replaced the mortise lock cylinder.' },

  // ---------------- APPLIANCE ----------------
  { category: 'APPLIANCE', priority: 'MEDIUM', title: 'Chimney not sucking smoke',
    description: 'The kitchen chimney runs but smoke and smell are not being pulled out while cooking.',
    cost: [500, 1800], resolution: 'Deep-cleaned the baffle filters and the duct; motor capacitor replaced.' },
  { category: 'APPLIANCE', priority: 'MEDIUM', title: 'Water purifier giving salty taste',
    description: 'RO water purifier water tastes salty and the flow has reduced a lot.',
    cost: [900, 3500], resolution: 'Replaced RO membrane and sediment and carbon filters.' },
  { category: 'APPLIANCE', priority: 'HIGH', title: 'Air conditioner leaking water inside room',
    description: 'The split AC in the master bedroom drips water from the indoor unit onto the bed. It also is not cooling well.',
    cost: [600, 2500], resolution: 'Drain pipe was choked; cleared it, cleaned the coils and topped up refrigerant.' },
  { category: 'APPLIANCE', priority: 'MEDIUM', title: 'AC not cooling',
    description: 'The bedroom air conditioner blows air but it is not cold even at 18 degrees.',
    cost: [1500, 4500], resolution: 'Gas leak at the flare joint fixed and refrigerant recharged.' },
  { category: 'APPLIANCE', priority: 'LOW', title: 'Exhaust fan not working in bathroom',
    description: 'The bathroom exhaust fan does not start and the bathroom stays humid and smelly.',
    cost: [350, 1100], resolution: 'Replaced the exhaust fan motor.' },

  // ---------------- PEST_CONTROL ----------------
  { category: 'PEST_CONTROL', priority: 'MEDIUM', title: 'Cockroaches in kitchen cabinets',
    description: 'We are seeing a lot of cockroaches inside the kitchen cabinets and near the sink at night.',
    cost: [800, 1800], resolution: 'Gel baiting in the kitchen and drain treatment done; follow-up visit after two weeks.' },
  { category: 'PEST_CONTROL', priority: 'HIGH', title: 'Termites in wooden wardrobe',
    description: 'Found mud tubes and powdery wood near the base of the bedroom wardrobe. Seems like termite infestation.',
    cost: [2500, 6000], resolution: 'Anti-termite drilling and injection treatment done around the wardrobe and skirting.' },
  { category: 'PEST_CONTROL', priority: 'MEDIUM', title: 'Rats entering through the utility area',
    description: 'Rats are coming in through the utility balcony at night and have chewed the washing machine pipe.',
    cost: [700, 2000], resolution: 'Sealed the gap around the drain pipe, placed bait stations and replaced the chewed hose.' },
  { category: 'PEST_CONTROL', priority: 'LOW', title: 'Mosquito menace from stagnant water',
    description: 'Lots of mosquitoes in the evenings. There seems to be stagnant water near the ducts outside our flat.',
    cost: [0, 800], resolution: 'Fogging done in the duct area and stagnant water drained.' },

  // ---------------- LIFT ----------------
  { category: 'LIFT', priority: 'URGENT', title: 'Lift stuck between floors',
    description: 'The lift in our block stopped between the 3rd and 4th floor with two people inside. Alarm was pressed and security helped them out.',
    cost: [0, 5000], resolution: 'Door lock contact fault; AMC technician replaced the landing door contact and ran safety checks.' },
  { category: 'LIFT', priority: 'HIGH', title: 'Elevator not working in our tower',
    description: 'The elevator has not been working since morning. Elderly residents on upper floors cannot go down.',
    cost: [0, 8000], resolution: 'Controller board fault after a power surge. Board replaced under AMC.' },
  { category: 'LIFT', priority: 'MEDIUM', title: 'Lift doors closing too fast',
    description: 'The lift doors shut very quickly and hit people entering. The door sensor does not seem to work.',
    cost: [0, 3000], resolution: 'Recalibrated the door light curtain sensor and door closing speed.' },
  { category: 'LIFT', priority: 'LOW', title: 'Jerky movement and noise in elevator',
    description: 'The lift jerks when starting and stopping and there is a squeaking noise between floors.',
    cost: [0, 2500], resolution: 'Guide rails lubricated and brake adjusted during AMC visit.' },

  // ---------------- SECURITY ----------------
  { category: 'SECURITY', priority: 'HIGH', title: 'CCTV camera near our block not working',
    description: 'The CCTV camera covering the entrance of our block has been off for a week. There were strangers seen last night.',
    cost: [1200, 4000], resolution: 'Replaced the camera power adapter and re-crimped the network cable; recording verified.' },
  { category: 'SECURITY', priority: 'MEDIUM', title: 'Video door phone not showing visitors',
    description: 'The intercom screen in the flat stays blank when someone at the gate calls. Audio also breaks.',
    cost: [600, 2500], resolution: 'Faulty intercom handset module replaced.' },
  { category: 'SECURITY', priority: 'MEDIUM', title: 'Access card not opening lobby door',
    description: 'My RFID access card stopped working at the lobby door and the basement entrance.',
    cost: [0, 300], resolution: 'Card re-registered in the access control system; a new card was issued.' },

  // ---------------- CLEANING ----------------
  { category: 'CLEANING', priority: 'LOW', title: 'Garbage not collected from our floor',
    description: 'Housekeeping has not collected the garbage from our floor for two days. The corridor smells.',
    cost: [0, 0], resolution: 'Housekeeping roster corrected for the floor; supervisor informed.' },
  { category: 'CLEANING', priority: 'LOW', title: 'Staircase and corridor not cleaned',
    description: 'The staircase near our flat has not been swept or mopped for many days and there is dust everywhere.',
    cost: [0, 0], resolution: 'Deep cleaning done and daily cleaning schedule shared with the residents.' },
  { category: 'CLEANING', priority: 'MEDIUM', title: 'Water tank cleaning due',
    description: 'Tap water has a muddy colour and smell. Overhead tank cleaning seems overdue.',
    cost: [0, 3500], resolution: 'Overhead and sump tanks cleaned and disinfected.' },

  // ---------------- PAINTING ----------------
  { category: 'PAINTING', priority: 'LOW', title: 'Wall paint peeling due to dampness',
    description: 'Paint on the bedroom wall next to the bathroom is bubbling and flaking. The wall feels damp to touch.',
    cost: [1500, 5000], resolution: 'Applied damp-proof primer after fixing the bathroom tile grout, then repainted the wall.' },
  { category: 'PAINTING', priority: 'LOW', title: 'Repainting required before move-in',
    description: 'Walls have marks and nail holes from the previous tenant. Requesting repainting of the living room.',
    cost: [4000, 12000], resolution: 'Living room putty patched and repainted with two coats.' },
  { category: 'PAINTING', priority: 'LOW', title: 'Fungus and black spots on wall',
    description: 'Black fungal spots are growing on the corner of the kids bedroom wall near the window.',
    cost: [1200, 4000], resolution: 'Treated with anti-fungal solution, fixed the window sill gap and repainted.' },

  // ---------------- INTERNET ----------------
  { category: 'INTERNET', priority: 'MEDIUM', title: 'Broadband fibre cable cut in duct',
    description: 'Our fibre internet is down since the painting work in the duct. The technician says the cable is cut inside the shaft.',
    cost: [0, 1000], resolution: 'Coordinated with the ISP to re-lay the fibre through the shaft.' },
  { category: 'INTERNET', priority: 'LOW', title: 'Wi-Fi not reaching bedroom',
    description: 'Requesting a network point in the bedroom. The router signal is very weak there for work from home.',
    cost: [800, 2500], resolution: 'Ran a CAT6 cable through the conduit and installed a wall socket.' },

  // ---------------- OTHER ----------------
  { category: 'OTHER', priority: 'LOW', title: 'Balcony grill loose',
    description: 'The safety grill on the balcony is shaky and a few screws are missing. Worried about kids.',
    cost: [400, 1500], resolution: 'Grill re-anchored with new fasteners and welded at one joint.' },
  { category: 'OTHER', priority: 'MEDIUM', title: 'Cracked floor tiles in hall',
    description: 'Two vitrified tiles in the living hall have cracked and have sharp edges.',
    cost: [900, 3000], resolution: 'Replaced the two cracked tiles with matching stock and regrouted.' },
  { category: 'OTHER', priority: 'LOW', title: 'Clothes drying hanger broken',
    description: 'The ceiling mounted cloth drying hanger in the balcony has a broken pulley and rope.',
    cost: [300, 900], resolution: 'Pulley and rope replaced.' },
];

// Short queries used in tests and in the demo to show paraphrase matching
export const DEMO_QUERIES = [
  'water dripping from the roof',
  'lift is not moving',
  'electricity keeps going off',
  'insects in the kitchen',
  'cupboard door came off',
];

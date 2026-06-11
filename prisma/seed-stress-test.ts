/**
 * Stress Test Seed Script — Marina Tower Dubai (150 Milestones)
 *
 * Usage:
 *   npm run seed:stress          — Insert stress test data (idempotent)
 *   npm run seed:stress -- --clean  — Remove all stress test data, then re-insert
 *
 * CRITICAL: Does NOT create Owner/PMC/Viewer users — uses existing ones.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─── Constants ───────────────────────────────────────────────────────────────
const PROJECT_NAME = 'Marina Tower — Dubai (Stress Test)';
const PROJECT_DURATION_MONTHS = 24;
const CONTRACT_VALUE = 45_000_000; // AED

const Role = { OWNER: 'OWNER', PMC: 'PMC', VENDOR: 'VENDOR', VIEWER: 'VIEWER' } as const;
const MilestoneState = {
  DRAFT: 'DRAFT', IN_PROGRESS: 'IN_PROGRESS', SUBMITTED: 'SUBMITTED',
  VERIFIED: 'VERIFIED', CLOSED: 'CLOSED',
} as const;
const EvidenceStatus = { SUBMITTED: 'SUBMITTED', APPROVED: 'APPROVED', REJECTED: 'REJECTED' } as const;
const EligibilityState = {
  NOT_DUE: 'NOT_DUE', DUE_PENDING_VERIFICATION: 'DUE_PENDING_VERIFICATION',
  VERIFIED_NOT_ELIGIBLE: 'VERIFIED_NOT_ELIGIBLE', PARTIALLY_ELIGIBLE: 'PARTIALLY_ELIGIBLE',
  FULLY_ELIGIBLE: 'FULLY_ELIGIBLE', BLOCKED: 'BLOCKED', MARKED_PAID: 'MARKED_PAID',
} as const;

// Date helpers
const now = new Date();
const projectStart = new Date(now.getTime() - PROJECT_DURATION_MONTHS * 30.44 * 86_400_000);
const monthOffset = (m: number) => new Date(projectStart.getTime() + m * 30.44 * 86_400_000);
const dayOffset = (base: Date, days: number) => new Date(base.getTime() + days * 86_400_000);

function randomInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// ─── Milestone Definitions ──────────────────────────────────────────────────
interface MilestoneDef {
  title: string;
  description: string;
  phase: number;
}

function generateMilestoneDefinitions(): MilestoneDef[] {
  const defs: MilestoneDef[] = [];

  // Phase 1 - Site Preparation & Foundation (1-20)
  const phase1 = [
    { title: 'Site Clearing and Demolition', description: 'Complete clearing of existing site structures and debris removal. Environmental assessment and disposal of hazardous materials per Dubai Municipality regulations. Site leveling to prepare for foundation works.' },
    { title: 'Boundary Wall Construction', description: 'Erection of temporary hoarding and permanent boundary walls around the project perimeter. Installation of security gates and construction signage as per DDA requirements.' },
    { title: 'Soil Investigation and Geotechnical Report', description: 'Comprehensive geotechnical investigation including borehole drilling, SPT tests, and lab analysis. Delivery of final geotechnical report with foundation recommendations for high-rise construction on Dubai Marina reclaimed land.' },
    { title: 'Dewatering System Installation', description: 'Installation and commissioning of deep-well dewatering system to manage high water table conditions typical of Dubai Marina. Continuous monitoring of drawdown levels during excavation phase.' },
    { title: 'Pile Cap Excavation', description: 'Bulk excavation for pile caps and ground beams to designed formation levels. Shoring and lateral support installation to maintain excavation stability in sandy soil conditions.' },
    { title: 'Bored Pile Installation — Grid A-E', description: 'Installation of bored cast-in-place piles for grid lines A through E using rotary drilling rigs. Each pile designed to 30m depth to reach competent bearing stratum. Concrete grade C60 per structural design.' },
    { title: 'Bored Pile Installation — Grid F-K', description: 'Continuation of piling works for grid lines F through K. Includes temporary casing installation, rebar cage placement, and tremie concreting. Full-time supervision by piling specialist.' },
    { title: 'Pile Integrity Testing', description: 'Cross-hole sonic logging and high-strain dynamic testing on selected piles per consultant specification. Testing covers minimum 10% of total piles. Report submission to structural engineer for review.' },
    { title: 'Lean Concrete Blinding', description: 'Placement of 75mm thick lean concrete blinding layer over excavated formation. Acts as working surface for foundation reinforcement fixing and prevents soil contamination of structural concrete.' },
    { title: 'Foundation Reinforcement', description: 'Supply, cutting, bending, and fixing of high-yield deformed steel bars for raft foundation and pile caps. Includes mechanical couplers at construction joints and spacer installation for correct cover.' },
    { title: 'Foundation Concrete Pour', description: 'Mass concrete pour for raft foundation using C50 concrete with thermal control measures. Pour sequence planned to minimize thermal cracking risk. Curing compound application and wet curing for minimum 7 days.' },
    { title: 'Waterproofing Membrane Application', description: 'Application of multi-layer waterproofing system to all below-grade structures. Includes primer, self-adhesive membrane, and protection board. System tested per ASTM standards prior to backfill.' },
    { title: 'Protection Screed', description: 'Installation of 50mm sand-cement protection screed over waterproofing membrane. Screed protects membrane during backfilling operations and subsequent construction traffic.' },
    { title: 'Basement Retaining Wall Formwork', description: 'Erection of steel formwork system for basement retaining walls. Includes alignment surveys, tie-bar installation, and form oil application. Formwork designed for concrete pressure at full pour height.' },
    { title: 'Retaining Wall Concrete Pour', description: 'Concrete placement for basement retaining walls in planned lift heights. Includes vibration, surface finishing, and curing. Water-stop installation at all construction joints per waterproofing specification.' },
    { title: 'Backfilling and Compaction', description: 'Controlled backfilling around completed basement structure using approved granular fill material. Compaction in 300mm layers to achieve minimum 95% modified Proctor density. Plate load tests for verification.' },
    { title: 'Underground Utilities Coordination', description: 'Coordination and installation of underground drainage, water supply, and electrical conduit connections. Liaison with DEWA, EMICOOL, and Etisalat for service connections. As-built survey of all buried services.' },
    { title: 'Site Office and Welfare Facilities Setup', description: 'Establishment of site office complex including contractor offices, consultant offices, meeting rooms, prayer room, and worker welfare facilities. First aid station and safety induction area setup.' },
    { title: 'Temporary Power and Water Installation', description: 'Installation of temporary electrical distribution panels and water storage tanks for construction use. DEWA temporary connection application and approval. Generator backup for critical operations.' },
    { title: 'Site Safety Audit and Clearance', description: 'Comprehensive safety audit of all foundation works and temporary installations. Clearance certificate from approved third-party safety auditor. Compliance verification with Dubai Municipality and Trakhees requirements.' },
  ];
  phase1.forEach(m => defs.push({ ...m, phase: 1 }));

  // Phase 2 - Structural Works (21-60)
  const floors = ['B2', 'B1', 'Ground', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th', '13th', '14th', '15th', '16th', '17th', '18th', '19th', '20th', '21st', '22nd'];
  // 25 floors × 1 milestone each = 25, plus extra structural milestones = 40 total
  for (let i = 0; i < 25; i++) {
    defs.push({
      title: `Structural Works — ${floors[i]} Floor`,
      description: `Column casting, shear wall construction, and slab pour for ${floors[i]} floor level. Includes formwork erection, rebar fixing per structural drawings, and concrete placement. Post-pour curing and early striking schedule per engineer approval.`,
      phase: 2,
    });
  }
  // Additional structural milestones to reach 40
  const phase2Extra = [
    { title: 'Transfer Slab at Podium Level', description: 'Construction of heavily reinforced transfer slab at podium level to redistribute loads from upper tower columns to podium-level supporting structure. Post-tensioning of transfer beams per specialist design.' },
    { title: 'Staircase Core Casting — Core 1', description: 'Slip-form or jump-form construction of staircase core 1 from basement to roof level. Includes landing slabs, flight formwork, and handrail embedments. Core provides lateral stability to tower.' },
    { title: 'Staircase Core Casting — Core 2', description: 'Construction of staircase core 2 using climbing formwork system. Includes MEP sleeve installation, door frame embedments, and fire-rated shaft construction per civil defense requirements.' },
    { title: 'Lift Shaft Construction', description: 'Construction of lift shaft cores for 4 passenger elevators and 1 service elevator. Includes guide rail bracket embedments, ventilation openings, and pit waterproofing. Dimensional accuracy survey at each floor.' },
    { title: 'Post-tensioning Works', description: 'Installation and stressing of post-tensioning tendons in transfer beams, podium slabs, and selected floor slabs. Grouting of ducts after stressing. Specialist contractor supervision and load testing verification.' },
    { title: 'Structural Steel Installation at Roof', description: 'Erection of structural steel framework for roof-level plant room, helipad frame, and architectural features. Includes connection bolt torquing, fire protection coating, and deflection checks.' },
    { title: 'Roof Slab and Parapet Construction', description: 'Final roof slab concrete pour with falls to drainage points. Parapet wall construction with coping stones. Includes waterproofing system installation and flashing details at all penetrations.' },
    { title: 'Structural Engineer Sign-off — Zone A', description: 'Formal structural inspection and sign-off for Zone A (grid A-E, all floors). Includes review of concrete cube results, rebar inspection records, and as-built survey. Defect rectification before sign-off.' },
    { title: 'Structural Engineer Sign-off — Zone B', description: 'Structural inspection and sign-off for Zone B (grid F-K, all floors). Final concrete quality verification, deflection measurements under service loads, and crack survey. Clearance for finishing works to commence.' },
    { title: 'Structural Completion Certificate', description: 'Issuance of structural completion certificate by the consultant structural engineer. Compilation of all test certificates, inspection records, and as-built drawings. Formal handover of structure to finishing trades.' },
    { title: 'Shear Wall Construction — Upper Floors', description: 'Construction of shear walls for floors 15-22 providing lateral load resistance. Includes starter bar continuity checks, lap splice inspections, and wall verticality surveys at each lift.' },
    { title: 'Column Reinforcement Inspection — All Floors', description: 'Systematic inspection of all column reinforcement across all floors before concrete pour. Verification of bar diameter, spacing, lap lengths, and cover blocks per structural drawings.' },
    { title: 'Concrete Quality Assurance Program', description: 'Implementation of concrete quality assurance program including cube casting at specified frequency, slump testing, temperature monitoring, and 7/28-day strength verification. Non-conformance reporting protocol.' },
    { title: 'Formwork System Mobilization and Setup', description: 'Mobilization and assembly of table-form and climbing-form systems for typical floor construction. Includes safety platform installation, crane attachment points, and form striking schedule development.' },
    { title: 'Structural Waterproofing — Below Grade', description: 'Application of crystalline waterproofing treatment to all below-grade structural concrete. Includes negative-side waterproofing for elevator pits and sump pits. Water testing before backfill approval.' },
  ];
  phase2Extra.forEach(m => defs.push({ ...m, phase: 2 }));

  // Phase 3 - MEP Rough-in (61-90)
  const phase3 = [
    { title: 'Electrical Conduit Installation — Zone A', description: 'Installation of PVC and GI conduit runs for lighting, power, and low-voltage systems in Zone A (grid A-E). Includes floor boxes, junction boxes, and pull wires. Coordination with structural openings.' },
    { title: 'Electrical Conduit Installation — Zone B', description: 'Conduit installation for Zone B (grid F-H) covering all floor levels. Includes fire-rated conduit at compartment boundaries and flexible conduit at equipment connections.' },
    { title: 'Electrical Conduit Installation — Zone C', description: 'Conduit installation for Zone C (grid H-K). Final zone completion achieving full floor coverage. Includes coordination with HVAC ductwork and plumbing routes.' },
    { title: 'Main LV Panel Installation', description: 'Installation and termination of main low-voltage distribution panels at designated electrical rooms on each floor group. Includes busbar connections, earth bonding, and labeling per single-line diagram.' },
    { title: 'Earthing and Lightning Protection', description: 'Installation of earthing grid, earth electrodes, and lightning protection system per BS EN 62305. Includes testing of earth resistance values and installation of surge protection devices at main panels.' },
    { title: 'Plumbing Rough-in — Floors B2 to 5th', description: 'Installation of hot water, cold water, and gas piping rough-in for basement through 5th floor. Includes valve installation, expansion loops, and pipe supports. Pressure testing at 1.5x working pressure.' },
    { title: 'Plumbing Rough-in — Floors 6th to 14th', description: 'Continuation of plumbing rough-in for floors 6-14. Includes riser connections, branch piping, and isolation valves at each apartment entry. Coordination with wall chase locations.' },
    { title: 'Plumbing Rough-in — Floors 15th to Roof', description: 'Upper floor plumbing rough-in including connection to roof-level water tanks. Includes pressure reducing valve stations and backflow prevention devices per authority requirements.' },
    { title: 'Drainage Stack Installation', description: 'Installation of soil, waste, and vent stacks from roof to basement collection point. Includes stack testing, AAV installation where approved, and connection to underground drainage network.' },
    { title: 'HVAC Main Duct Installation', description: 'Fabrication and installation of main supply and return air ductwork from AHU rooms to floor distribution points. Includes fire dampers at compartment walls and flexible duct connections.' },
    { title: 'AHU Installation — Floors B2 to 10th', description: 'Installation of air handling units for lower floors. Includes vibration isolation mounts, duct connections, electrical terminations, and condensate drain piping. Pre-commissioning checks.' },
    { title: 'AHU Installation — Floors 11th to Roof', description: 'AHU installation for upper floors including penthouse and common areas. Includes chilled water piping connections, control valve installation, and BMS point terminations.' },
    { title: 'Fire Suppression Main Piping', description: 'Installation of wet sprinkler system main risers, floor control valve assemblies, and distribution piping. System designed per NFPA 13 and approved by Dubai Civil Defense. Hydrostatic testing at 200 PSI.' },
    { title: 'Fire Alarm Loop Cabling', description: 'Installation of addressable fire alarm loop cabling connecting all detection devices, manual call points, and notification appliances. Includes cable fireproofing at compartment penetrations.' },
    { title: 'BMS Backbone Cabling', description: 'Installation of building management system backbone network including fiber optic and copper cabling between BMS server room and floor-level controllers. Includes network switch installation.' },
    { title: 'ELV Systems Rough-in', description: 'Extra low voltage systems rough-in including CCTV, access control, intercom, SMATV, and structured cabling. Includes containment routing, floor outlet boxes, and backbone cable installation.' },
    { title: 'Generator Installation and Testing', description: 'Installation of standby diesel generator set including exhaust system, fuel tank, day tank, and acoustic enclosure. Load bank testing at 100% and 110% rated capacity. ATS changeover testing.' },
    { title: 'Water Tank Installation', description: 'Installation of upper and lower domestic water tanks including level controls, overflow piping, and chlorination system. Includes structural support verification and seismic restraint installation.' },
    { title: 'Pump Room Equipment Installation', description: 'Installation of domestic water booster pumps, fire pumps, drainage pumps, and chilled water pumps. Includes VFD installation, piping connections, and control panel terminations.' },
    { title: 'MEP Coordination Drawing Sign-off', description: 'Final review and approval of coordinated MEP shop drawings showing all services without clashes. BIM model verification and sign-off by all MEP disciplines and structural engineer.' },
    { title: 'Chilled Water Piping Installation', description: 'Installation of chilled water supply and return piping from district cooling plant room to floor-level FCUs. Includes insulation, valve installation, and air vent placement at high points.' },
    { title: 'Kitchen Exhaust Duct Installation', description: 'Installation of kitchen exhaust ductwork from apartment kitchens to roof-level exhaust fans. Includes grease filters, fire dampers, and access panels per food safety requirements.' },
    { title: 'Bathroom Extract Fan Ducting', description: 'Installation of extract ductwork from bathrooms and utility rooms to roof-level extract fans. Includes backdraft dampers, acoustic attenuators, and connection to weather-proof louvres.' },
    { title: 'Electrical Cable Pulling — Power', description: 'Pulling of main power cables from transformer room to floor-level distribution boards. Includes cable tray loading calculations, cable support spacing, and fireproof sleeving at penetrations.' },
    { title: 'Electrical Cable Pulling — Lighting', description: 'Pulling of lighting circuit cables from distribution boards to switch positions and fixture locations. Includes emergency lighting circuit wiring and dimming control wiring where specified.' },
    { title: 'MEP Sleeve and Opening Verification', description: 'Final verification that all MEP sleeves, openings, and penetrations through structural elements are correctly located per coordinated drawings. Fire stopping schedule preparation.' },
    { title: 'Temporary MEP Services for Testing', description: 'Installation of temporary power, water, and drainage services to support wet testing of completed plumbing and fire suppression systems. Includes temporary electrical boards for tool power.' },
    { title: 'Fire Sprinkler Branch Piping', description: 'Installation of sprinkler branch piping and sprinkler heads on all floors. Includes pendant, upright, and concealed heads per design. System flushing and flow test preparation.' },
    { title: 'Smoke Extract System Installation', description: 'Installation of smoke extract ductwork and fans for basement car park and common corridors. Includes smoke detectors, motorized dampers, and control panel programming per civil defense approval.' },
    { title: 'MEP Rough-in Completion Certificate', description: 'Formal inspection and certification that all MEP rough-in works are complete and ready for finishing trades. Includes pressure test certificates, insulation inspection, and photographic records.' },
  ];
  phase3.forEach(m => defs.push({ ...m, phase: 3 }));

  // Phase 4 - Finishing Works (91-130)
  const phase4 = [
    { title: 'Blockwork — Floors B2 to 5th', description: 'Lightweight concrete block partition construction for basement through 5th floor. Includes door and window openings, lintel installation, and movement joint provision per structural engineer details.' },
    { title: 'Blockwork — Floors 6th to 14th', description: 'Block partition construction for floors 6-14. Includes fire-rated blockwork at shaft walls and staircase enclosures. Wall tie installation at junctions with structural elements.' },
    { title: 'Blockwork — Floors 15th to 22nd', description: 'Upper floor block partitions including penthouse units. Includes acoustic block at party walls between units and fire-rated blocks at corridor walls per fire strategy.' },
    { title: 'Plasterwork — Zone A', description: 'Internal plastering of all blockwork and concrete surfaces in Zone A. Includes dubbing out of uneven surfaces, mesh application at dissimilar material junctions, and corner bead installation.' },
    { title: 'Plasterwork — Zone B', description: 'Internal plastering for Zone B including bathrooms and kitchens. Includes waterproof render in wet areas and smooth finish plaster in living spaces. Surface flatness check per specification.' },
    { title: 'Floor Screed — Zone A', description: 'Installation of sand-cement floor screed in Zone A with falls to floor drains in wet areas. Includes screed reinforcement mesh, insulation layer where specified, and underfloor heating pipes.' },
    { title: 'Floor Screed — Zone B', description: 'Floor screed installation for Zone B. Includes coordination with MEP floor penetrations, movement joints at doorway thresholds, and surface preparation for final floor finish.' },
    { title: 'External Facade Cladding — Floors B2 to 5th', description: 'Installation of curtain wall and cladding system for lower floors including podium level. Includes structural silicone sealing, pressure equalization chambers, and water tightness testing.' },
    { title: 'External Facade Cladding — Floors 6th to 10th', description: 'Facade installation for mid-level floors. Includes unitized curtain wall panel lifting and fixing, gasket installation, and vision panel alignment checks. Safety netting maintenance.' },
    { title: 'External Facade Cladding — Floors 11th to 15th', description: 'Continuation of facade works at upper levels. Includes wind pressure testing of representative panels, thermal break verification, and solar control glass installation.' },
    { title: 'External Facade Cladding — Floors 16th to 22nd', description: 'Facade installation for upper floors and penthouse levels. Includes roof parapet cladding, architectural feature panels, and final sealant application. Weather tightness commissioning.' },
    { title: 'Window Installation — All Zones', description: 'Installation of operable windows at designated locations. Includes hardware adjustment, weather sealing, safety glass verification, and opening restrictor installation per fall protection requirements.' },
    { title: 'Internal Door Frame Installation', description: 'Installation of pressed steel and timber door frames throughout all floors. Includes fire-rated frames at protected openings, vision panel frames, and acoustic door sets at party walls.' },
    { title: 'Floor Tiling — Zone A', description: 'Installation of porcelain floor tiles in Zone A common areas and residential units. Includes waterproof membrane in wet areas, tile adhesive application, and grout finishing. Level checks per tolerance.' },
    { title: 'Floor Tiling — Zone B', description: 'Floor tiling for Zone B including feature tile layouts in lobbies and entrance areas. Includes marble threshold installations, skirting tile fixing, and expansion joint formation.' },
    { title: 'Wall Tiling — Wet Areas Zone A', description: 'Ceramic wall tile installation in bathrooms, kitchens, and laundry rooms for Zone A. Includes waterproof membrane behind tiles, niche and shelf tiling, and accessory fixing points.' },
    { title: 'Wall Tiling — Wet Areas Zone B', description: 'Wall tiling completion for Zone B wet areas. Includes feature wall treatments, mosaic borders, and sanitaryware fixing point coordination. Final grout and sealant application.' },
    { title: 'Joinery Installation — Floors B2 to 10th', description: 'Installation of kitchen cabinets, wardrobes, vanity units, and storage joinery for lower half of building. Includes countertop templating, hardware adjustment, and protective covering.' },
    { title: 'Joinery Installation — Floors 11th to 22nd', description: 'Joinery installation for upper floors including premium finishes for penthouse units. Includes soft-close hardware, LED lighting integration, and appliance cut-out preparation.' },
    { title: 'Sanitary Ware Installation — Zone A', description: 'Installation of WCs, basins, bathtubs, shower trays, and accessories in Zone A. Includes trap connections, mixer tap installation, and water supply commissioning. Leak testing per unit.' },
    { title: 'Sanitary Ware Installation — Zone B', description: 'Sanitary ware installation for Zone B. Includes premium fixtures for penthouses, accessibility fixtures for designated units, and final connections to waste and water supply.' },
    { title: 'Ceiling Grid Installation — Zone A', description: 'Installation of suspended ceiling grid system in Zone A common areas and corridors. Includes level surveys, hanger installation, and coordination with MEP services above ceiling.' },
    { title: 'Ceiling Grid Installation — Zone B', description: 'Ceiling grid for Zone B. Includes access panels at maintenance points, fire-rated ceiling at protected areas, and acoustic tile installation in common spaces.' },
    { title: 'Gypsum Board Ceiling — All Residential', description: 'Installation of gypsum board ceilings in all residential units. Includes curved details at architectural features, LED strip recesses, and skim coat finishing for paint readiness.' },
    { title: 'Painting — First Coat All Zones', description: 'Application of primer and first coat of paint to all internal walls and ceilings. Includes surface preparation, crack filling, and sanding. Color coding verification against design schedule.' },
    { title: 'Painting — Final Coat All Zones', description: 'Application of final paint coat to all surfaces. Includes touch-up of damaged areas, edge cutting at dissimilar surfaces, and protection of adjacent finished surfaces. Quality inspection.' },
    { title: 'Skirting and Finishing Details — Zone A', description: 'Installation of skirting boards, architraves, and finishing trims in Zone A. Includes mitred corners, scribe fitting to uneven surfaces, and filling and painting of nail holes.' },
    { title: 'Skirting and Finishing Details — Zone B', description: 'Finishing details for Zone B. Includes shadow gap details, feature wall trims, and transition strips at floor level changes. Final clean-up and defect marking preparation.' },
    { title: 'Balcony Waterproofing and Tiling', description: 'Application of liquid waterproofing membrane to all balcony floors with upstands. Includes drainage falls, anti-slip tile installation, and glass balustrade base waterproofing detail.' },
    { title: 'Common Area Finishing', description: 'Completion of all common area finishes including lobbies, corridors, lift lobbies, and stairwells. Includes feature lighting, signage installation, and decorative finishes per interior design package.' },
    { title: 'Roof Terrace and Amenity Area Finishing', description: 'Installation of roof terrace finishes including timber decking, planter boxes, pergola structures, and outdoor lighting. Includes waterproofing verification and drainage system testing.' },
    { title: 'Parking Area Floor Coating', description: 'Application of epoxy floor coating system to all basement parking areas. Includes line marking, bay numbering, directional signage, and speed bump installation. Anti-slip aggregate in ramp areas.' },
    { title: 'Main Entrance and Lobby Finishing', description: 'Premium finishing of main building entrance and ground floor lobby. Includes marble flooring, feature wall cladding, reception desk installation, and architectural lighting installation.' },
    { title: 'Stairwell Finishing and Handrails', description: 'Completion of stairwell finishes including anti-slip nosing on all treads, handrail installation per code, fire-rated door installation, and emergency signage placement.' },
    { title: 'External Landscaping Hardscape', description: 'Installation of external paving, kerb stones, planter edges, and hard landscape elements. Includes irrigation system rough-in, drainage grating installation, and vehicle bollard placement.' },
    { title: 'Cleaning and Protection Removal', description: 'Systematic removal of all protective coverings, cleaning of all glass surfaces, floor polishing, and builder clean throughout all units and common areas. Includes waste removal and skip clearance.' },
    { title: 'Finishing Works Snag Survey', description: 'Comprehensive snagging survey of all finishing works across every unit and common area. Defect tagging system implementation with photographic records. Snag list compilation per floor and unit.' },
    { title: 'Snag Rectification — First Round', description: 'Systematic rectification of all snagged items from finishing survey. Priority given to critical items affecting handover. Progress tracking through digital snag management system.' },
    { title: 'Curtain and Blind Installation', description: 'Installation of curtain tracks, motorized blinds, and blackout systems in all residential units. Includes electrical connection for motorized systems and remote control programming.' },
    { title: 'Appliance Installation and Testing', description: 'Installation of kitchen appliances including cooktop, oven, dishwasher, and washing machine. Electrical and plumbing connections, commissioning, and functionality testing per unit.' },
  ];
  phase4.forEach(m => defs.push({ ...m, phase: 4 }));

  // Phase 5 - Fit-out & Handover (131-150)
  const phase5 = [
    { title: 'FF&E Delivery and Installation', description: 'Delivery, unpacking, and installation of all furniture, fixtures, and equipment for common areas and show apartments. Includes assembly, placement verification against layout drawings, and protective covering.' },
    { title: 'Light Fixture Installation and Testing', description: 'Installation of all permanent light fixtures including recessed downlights, feature pendants, and emergency lighting. Circuit testing, dimming function verification, and lux level measurements.' },
    { title: 'HVAC Balancing and Commissioning', description: 'Air balancing of all HVAC systems using calibrated instruments. Includes airflow measurement at each diffuser, temperature verification, and noise level testing. Commissioning certificates per system.' },
    { title: 'Plumbing Pressure Testing and Sign-off', description: 'Final pressure testing of all domestic water and gas systems. Flow rate verification at each outlet. Water quality testing per Dubai Municipality requirements. System sign-off by consultant.' },
    { title: 'Electrical Load Testing', description: 'Full electrical load testing including phase balance verification, earth loop impedance testing, and RCD trip testing. Thermographic survey of main distribution boards. Certificate issuance.' },
    { title: 'Fire Alarm System Commissioning', description: 'Full commissioning of addressable fire alarm system including cause-and-effect matrix testing, voice alarm intelligibility testing, and integration with BMS. Civil Defense witness testing.' },
    { title: 'BMS Commissioning and Handover', description: 'Building management system commissioning including all point verification, alarm setpoint configuration, trending setup, and graphics package completion. Operator training sessions.' },
    { title: 'Elevator Installation and Testing', description: 'Final installation, adjustment, and testing of all passenger and service elevators. Includes load testing, door timing adjustment, fire service recall testing, and authority inspection preparation.' },
    { title: 'Swimming Pool and Gym Fit-out', description: 'Completion of swimming pool tiling, filtration system commissioning, and gym equipment installation. Includes pool water treatment, safety equipment, and changing room finishing.' },
    { title: 'Landscaping and External Works', description: 'Soft landscaping installation including trees, shrubs, ground cover, and turf. Irrigation system commissioning, external lighting testing, and boundary wall finishing. External signage installation.' },
    { title: 'Authority Inspection — Civil Defense', description: 'Formal inspection by Dubai Civil Defense covering fire alarm, sprinkler, smoke extract, and firefighting systems. Includes document submission, system demonstration, and deficiency rectification if required.' },
    { title: 'Authority Inspection — DEWA', description: 'DEWA final inspection of electrical and water installations. Includes meter installation, connection energization, and system testing. Power-on for permanent supply.' },
    { title: 'Authority Inspection — Municipality', description: 'Dubai Municipality final inspection covering building compliance, accessibility, signage, and civil works. Certificate of completion application and approval process.' },
    { title: 'Snagging Round 1 — All Units', description: 'Comprehensive snagging inspection of all residential units and common areas with client representative. Digital snag tracking with photographic evidence. Priority categorization of defects.' },
    { title: 'Snagging Round 2 — Rectification Verify', description: 'Verification inspection of all rectified snag items from Round 1. Re-snagging of any items not satisfactorily completed. Sign-off of cleared items on digital tracking system.' },
    { title: 'Final Punch List Clearance', description: 'Resolution of all remaining items on the final punch list. Joint inspection with client, consultant, and contractor. Written confirmation of zero outstanding items before handover.' },
    { title: 'As-built Drawings Submission', description: 'Compilation and submission of complete as-built drawings for all disciplines. Includes architectural, structural, MEP, and landscape as-built drawings in both hard copy and digital formats.' },
    { title: 'O&M Manuals Handover', description: 'Preparation and handover of operations and maintenance manuals for all building systems. Includes equipment warranties, spare parts lists, maintenance schedules, and emergency procedures.' },
    { title: 'Keys and Access Cards Handover', description: 'Preparation and handover of all unit keys, master keys, common area keys, and access control cards. Includes key schedule, access control system training, and security handover protocol.' },
    { title: 'Practical Completion Certificate', description: 'Formal issuance of Practical Completion Certificate by the consultant following satisfactory completion of all works. Marks the start of the defects liability period and triggers final payment milestone.' },
  ];
  phase5.forEach(m => defs.push({ ...m, phase: 5 }));

  return defs;
}

// ─── Phase budgets ───────────────────────────────────────────────────────────
const PHASE_BUDGETS: Record<number, number> = {
  1: 4_500_000,
  2: 18_000_000,
  3: 8_000_000,
  4: 10_500_000,
  5: 4_000_000,
};

function getPhaseMilestoneCounts(): Record<number, number> {
  return { 1: 20, 2: 40, 3: 30, 4: 40, 5: 20 };
}

function distributeValues(total: number, count: number): number[] {
  // Distribute somewhat unevenly for realism
  const values: number[] = [];
  let remaining = total;
  for (let i = 0; i < count - 1; i++) {
    const avg = remaining / (count - i);
    const val = Math.round(avg * (0.7 + Math.random() * 0.6));
    values.push(val);
    remaining -= val;
  }
  values.push(remaining);
  return values;
}

// ─── Monthly cost data (S-curve) ─────────────────────────────────────────────
const MONTHLY_ACTUAL_SPEND = [
  280_000, 420_000, 680_000, 1_100_000, 1_650_000, 2_200_000,
  2_800_000, 3_100_000, 3_400_000, 3_600_000, 3_550_000, 3_200_000,
  2_900_000, 2_600_000, 2_300_000, 2_100_000, 1_900_000, 1_700_000,
  1_400_000, 1_100_000, 850_000, 620_000, 380_000, 170_000,
];

// Planned is evenly distributed
const TOTAL_PLANNED = CONTRACT_VALUE;
const MONTHLY_PLANNED = Array.from({ length: 24 }, () => Math.round(TOTAL_PLANNED / 24));

// ─── Milestone velocity distribution ─────────────────────────────────────────
// Which months each approved milestone gets completedAt
const VELOCITY_DISTRIBUTION = [
  // month: count
  { month: 1, count: 1 }, { month: 2, count: 2 },
  { month: 3, count: 3 }, { month: 4, count: 3 },
  { month: 5, count: 5 }, { month: 6, count: 5 },
  { month: 7, count: 6 }, { month: 8, count: 6 }, { month: 9, count: 6 },
  { month: 10, count: 7 }, { month: 11, count: 7 }, { month: 12, count: 7 },
  { month: 13, count: 5 }, { month: 14, count: 5 }, { month: 15, count: 4 },
  { month: 16, count: 3 }, { month: 17, count: 3 }, { month: 18, count: 2 },
];

// ─── BOQ definitions by phase ────────────────────────────────────────────────
interface BOQItemDef {
  description: string;
  unit: string;
  qty: number;
  rate: number;
}

function getPhaseBoqItems(phase: number): BOQItemDef[] {
  switch (phase) {
    case 1: return [
      { description: 'Earthworks and Excavation', unit: 'm³', qty: 12000, rate: 45 },
      { description: 'Bored Piling (30m depth)', unit: 'nos', qty: 120, rate: 8500 },
      { description: 'Structural Concrete C50', unit: 'm³', qty: 3500, rate: 420 },
      { description: 'Reinforcement Steel', unit: 'ton', qty: 280, rate: 3200 },
      { description: 'Waterproofing Membrane System', unit: 'm²', qty: 4500, rate: 85 },
      { description: 'Formwork (Foundation)', unit: 'm²', qty: 6000, rate: 55 },
      { description: 'Dewatering System Operation', unit: 'month', qty: 6, rate: 45000 },
    ];
    case 2: return [
      { description: 'Structural Concrete C50/C60', unit: 'm³', qty: 18000, rate: 450 },
      { description: 'Reinforcement Steel Grade 60', unit: 'ton', qty: 2200, rate: 3400 },
      { description: 'Formwork System (Typical Floor)', unit: 'm²', qty: 45000, rate: 48 },
      { description: 'Post-tensioning Strand and Works', unit: 'ton', qty: 85, rate: 12000 },
      { description: 'Structural Steel', unit: 'ton', qty: 120, rate: 8500 },
      { description: 'Concrete Pumping', unit: 'm³', qty: 18000, rate: 35 },
    ];
    case 3: return [
      { description: 'Electrical Conduit (PVC/GI)', unit: 'm', qty: 85000, rate: 12 },
      { description: 'Cable Trays and Ladders', unit: 'm', qty: 12000, rate: 65 },
      { description: 'HVAC Ductwork', unit: 'm²', qty: 28000, rate: 75 },
      { description: 'Plumbing Pipes (CPVC/PPR)', unit: 'm', qty: 42000, rate: 28 },
      { description: 'Fire Suppression Pipes', unit: 'm', qty: 18000, rate: 45 },
      { description: 'Electrical Cables (Power)', unit: 'm', qty: 120000, rate: 18 },
      { description: 'BMS and ELV Cabling', unit: 'm', qty: 35000, rate: 22 },
      { description: 'AHU Units Supply and Install', unit: 'nos', qty: 48, rate: 15000 },
    ];
    case 4: return [
      { description: 'Lightweight Blockwork', unit: 'm²', qty: 42000, rate: 35 },
      { description: 'Internal Plastering', unit: 'm²', qty: 85000, rate: 18 },
      { description: 'Floor Tiles (Porcelain)', unit: 'm²', qty: 32000, rate: 65 },
      { description: 'Wall Tiles (Ceramic)', unit: 'm²', qty: 18000, rate: 55 },
      { description: 'Paint (2 coats + primer)', unit: 'm²', qty: 120000, rate: 12 },
      { description: 'Joinery Units (Kitchen/Wardrobe)', unit: 'nos', qty: 420, rate: 4500 },
      { description: 'Internal Doors (Complete)', unit: 'nos', qty: 680, rate: 850 },
      { description: 'Facade Cladding System', unit: 'm²', qty: 15000, rate: 220 },
    ];
    case 5: return [
      { description: 'FF&E Supply and Install', unit: 'lumpsum', qty: 1, rate: 850000 },
      { description: 'Testing and Commissioning', unit: 'lumpsum', qty: 1, rate: 620000 },
      { description: 'Authority Inspection Fees', unit: 'lumpsum', qty: 1, rate: 180000 },
      { description: 'Elevator Supply and Install', unit: 'nos', qty: 5, rate: 185000 },
      { description: 'Swimming Pool Works', unit: 'lumpsum', qty: 1, rate: 320000 },
      { description: 'Landscaping and External Works', unit: 'lumpsum', qty: 1, rate: 450000 },
      { description: 'Snagging and Defects Rectification', unit: 'lumpsum', qty: 1, rate: 150000 },
    ];
    default: return [];
  }
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────
async function cleanup() {
  // console.log('🧹 Cleaning up stress test data...');

  const project = await prisma.project.findFirst({
    where: { name: PROJECT_NAME },
  });

  if (!project) {
    // console.log('  No stress test project found. Nothing to clean.');
    return;
  }

  const pid = project.id;

  // Delete in FK-safe order
  await prisma.privateCostEntry.deleteMany({ where: { projectId: pid } });
  await prisma.cashAdjustment.deleteMany({ where: { projectId: pid } });
  await prisma.systemEvent.deleteMany({ where: { projectId: pid } });
  await prisma.projectMetrics.deleteMany({ where: { projectId: pid } });
  await prisma.vendorMetrics.deleteMany({ where: { projectId: pid } });
  await prisma.auditLog.deleteMany({ where: { projectId: pid } });
  await prisma.followUp.deleteMany({ where: { projectId: pid } });

  // Milestone child records
  const milestoneIds = (await prisma.milestone.findMany({
    where: { projectId: pid }, select: { id: true },
  })).map(m => m.id);

  if (milestoneIds.length > 0) {
    await prisma.eligibilityEvent.deleteMany({
      where: { paymentEligibility: { milestoneId: { in: milestoneIds } } },
    });
    await prisma.paymentEligibility.deleteMany({ where: { milestoneId: { in: milestoneIds } } });
    await prisma.verification.deleteMany({ where: { milestoneId: { in: milestoneIds } } });
    await prisma.evidenceFile.deleteMany({
      where: { evidence: { milestoneId: { in: milestoneIds } } },
    });
    await prisma.evidence.deleteMany({ where: { milestoneId: { in: milestoneIds } } });
    await prisma.milestoneStateTransition.deleteMany({ where: { milestoneId: { in: milestoneIds } } });
    await prisma.milestoneBOQLink.deleteMany({ where: { milestoneId: { in: milestoneIds } } });
    await prisma.milestoneDependency.deleteMany({
      where: { OR: [{ predecessorId: { in: milestoneIds } }, { successorId: { in: milestoneIds } }] },
    });
    await prisma.milestone.deleteMany({ where: { projectId: pid } });
  }

  // BOQ
  const boqIds = (await prisma.bOQ.findMany({ where: { projectId: pid }, select: { id: true } })).map(b => b.id);
  if (boqIds.length > 0) {
    await prisma.bOQRevision.deleteMany({ where: { boqId: { in: boqIds } } });
    await prisma.bOQItem.deleteMany({ where: { boqId: { in: boqIds } } });
    await prisma.bOQ.deleteMany({ where: { projectId: pid } });
  }

  await prisma.customView.deleteMany({ where: { projectId: pid } });
  await prisma.projectScheduleConfig.deleteMany({ where: { projectId: pid } });
  await prisma.projectRole.deleteMany({ where: { projectId: pid } });
  await prisma.project.delete({ where: { id: pid } });

  // Delete stress-test vendor users (NOT existing users)
  await prisma.user.deleteMany({
    where: { email: { in: ['vendor2@stresstest.axinfra.io', 'vendor3@stresstest.axinfra.io'] } },
  });

  // console.log('  ✓ Cleanup complete.\n');
}

// ─── Main seed function ──────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const shouldClean = args.includes('--clean');

  if (shouldClean) {
    await cleanup();
  }

  // Check if project already exists (idempotent)
  const existing = await prisma.project.findFirst({ where: { name: PROJECT_NAME } });
  if (existing) {
    // console.log(`⚠️  Project "${PROJECT_NAME}" already exists. Use --clean flag to recreate.`);
    return;
  }

  // console.log('🏗️  Seeding Marina Tower stress test data...\n');

  // ── Step 0: Query existing users ──────────────────────────────────────────
  // console.log('Step 0: Finding existing users...');

  const ownerRole = await prisma.projectRole.findFirst({
    where: { role: Role.OWNER },
    include: { user: true },
  });
  const pmcRole = await prisma.projectRole.findFirst({
    where: { role: Role.PMC },
    include: { user: true },
  });
  const viewerRole = await prisma.projectRole.findFirst({
    where: { role: Role.VIEWER },
    include: { user: true },
  });
  const vendorRoles = await prisma.projectRole.findMany({
    where: { role: Role.VENDOR },
    include: { user: true },
    distinct: ['userId'],
  });

  if (!ownerRole || !pmcRole) {
    console.error('❌ Could not find existing OWNER or PMC user. Run the base seed first: npm run db:seed');
    process.exit(1);
  }

  const ownerUser = ownerRole.user;
  const pmcUser = pmcRole.user;
  const viewerUser = viewerRole?.user;

  // console.log(`  Owner:  ${ownerUser.email} (${ownerUser.name})`);
  // console.log(`  PMC:    ${pmcUser.email} (${pmcUser.name})`);
  if (viewerUser) console.log(`  Viewer: ${viewerUser.email} (${viewerUser.name})`);

  // Get/create vendor users
  const vendorUsers: Array<{ id: string; name: string; email: string }> = [];
  const uniqueVendors = new Map<string, typeof vendorRoles[0]['user']>();
  for (const vr of vendorRoles) {
    if (!uniqueVendors.has(vr.userId)) {
      uniqueVendors.set(vr.userId, vr.user);
    }
  }
  uniqueVendors.forEach((user) => {
    vendorUsers.push({ id: user.id, name: user.name, email: user.email });
  });

  // Create additional vendors if needed (need at least 3)
  const vendorEmails = ['vendor2@stresstest.axinfra.io', 'vendor3@stresstest.axinfra.io'];
  const vendorNames = ['Gulf MEP Contractors LLC', 'Emirates Finishing Works Co.'];
  const vendorHash = await bcrypt.hash('Axinfra@2024', 10);

  for (let i = 0; i < vendorEmails.length; i++) {
    if (vendorUsers.length >= 3) break;
    const existingVendor = await prisma.user.findUnique({ where: { email: vendorEmails[i] } });
    if (existingVendor) {
      vendorUsers.push({ id: existingVendor.id, name: existingVendor.name, email: existingVendor.email });
    } else {
      const newVendor = await prisma.user.create({
        data: { name: vendorNames[i], email: vendorEmails[i], hashedPassword: vendorHash },
      });
      vendorUsers.push({ id: newVendor.id, name: newVendor.name, email: newVendor.email });
    }
  }

  // console.log(`  Vendors: ${vendorUsers.map(v => v.email).join(', ')}`);
  // console.log('');

  // ── Step 1: Create project ────────────────────────────────────────────────
  // console.log('Step 1: Creating project...');

  const project = await prisma.project.create({
    data: {
      name: PROJECT_NAME,
      description: 'A 25-story luxury residential tower in Dubai Marina, UAE. High-rise construction project including 2 basement levels, ground floor commercial, and 22 residential floors with penthouse units.',
      status: 'ONGOING',
      metadata: JSON.stringify({
        location: 'Dubai Marina, UAE',
        contractValue: CONTRACT_VALUE,
        currency: 'AED',
        startDate: projectStart.toISOString(),
        endDate: dayOffset(projectStart, PROJECT_DURATION_MONTHS * 30.44).toISOString(),
        type: 'High-rise Residential Construction',
      }),
    },
  });

  // Assign roles
  const roleAssignments: Array<{ projectId: string; userId: string; role: string }> = [
    { projectId: project.id, userId: ownerUser.id, role: Role.OWNER },
    { projectId: project.id, userId: pmcUser.id, role: Role.PMC },
  ];
  if (viewerUser) {
    roleAssignments.push({ projectId: project.id, userId: viewerUser.id, role: Role.VIEWER });
  }
  for (const vu of vendorUsers) {
    roleAssignments.push({ projectId: project.id, userId: vu.id, role: Role.VENDOR });
  }
  await prisma.projectRole.createMany({ data: roleAssignments });

  // Schedule config
  await prisma.projectScheduleConfig.create({
    data: {
      projectId: project.id,
      projectStartDate: projectStart,
      dailyOverheadCost: 15000,
      penaltyRatePerDay: 0.001,
      opportunityCostFactor: 1.2,
    },
  });

  // console.log(`  ✓ Project created: ${project.id}`);

  // ── Step 2: Create milestones ─────────────────────────────────────────────
  // console.log('\nStep 2: Creating 150 milestones...');

  const milestoneDefs = generateMilestoneDefinitions();
  const phaseCounts = getPhaseMilestoneCounts();

  // Distribute values per phase
  const milestoneValues: number[] = [];
  let phaseIdx = 0;
  for (let phase = 1; phase <= 5; phase++) {
    const count = phaseCounts[phase];
    const phaseValues = distributeValues(PHASE_BUDGETS[phase], count);
    milestoneValues.push(...phaseValues);
    phaseIdx += count;
  }

  // Status distribution: 80 APPROVED, 20 IN_REVIEW, 35 PENDING, 15 REJECTED
  function getMilestoneStatus(idx: number): string {
    const num = idx + 1;
    if (num <= 80) return 'APPROVED';
    if (num <= 100) return 'IN_REVIEW';
    if (num <= 135) return 'PENDING';
    return 'REJECTED'; // 136–150
  }

  // Map statuses to actual state machine states
  function toMilestoneState(status: string): string {
    switch (status) {
      case 'APPROVED': return MilestoneState.CLOSED;
      case 'IN_REVIEW': return MilestoneState.SUBMITTED;
      case 'REJECTED': return MilestoneState.IN_PROGRESS;
      case 'PENDING': return MilestoneState.DRAFT;
      default: return MilestoneState.DRAFT;
    }
  }

  // Vendor assignment based on milestone index
  function getVendorForMilestone(idx: number): string {
    const num = idx + 1;
    if (vendorUsers.length === 1) return vendorUsers[0].id;
    if (vendorUsers.length === 2) {
      if (num <= 60) return vendorUsers[0].id;
      return vendorUsers[1].id;
    }
    // 3+ vendors
    if (num <= 60) return vendorUsers[0].id; // Civil + structural
    if (num <= 90) return vendorUsers.length > 1 ? vendorUsers[1].id : vendorUsers[0].id; // MEP
    return vendorUsers.length > 2 ? vendorUsers[2].id : vendorUsers[vendorUsers.length - 1].id; // Finishing
  }

  // Build velocity assignment (which month each approved milestone completes)
  const completionMonths: number[] = [];
  for (const { month, count } of VELOCITY_DISTRIBUTION) {
    for (let i = 0; i < count; i++) completionMonths.push(month);
  }

  // Delayed milestone indices (within the 80 approved ones)
  const delayedIndices = new Set<number>();
  const delayDays: Map<number, number> = new Map();
  const delayReasons = [
    'Material delivery delayed due to port congestion',
    'Rebar shortage from supplier',
    'Adverse weather conditions (sandstorm)',
    'Subcontractor workforce shortage',
    'Design revision by consultant',
    'Equipment breakdown on site',
    'Permit approval delay from authority',
    'Concrete supplier quality issue',
    'Coordination clash with MEP trades',
    'Safety stand-down after incident investigation',
    'Crane breakdown and replacement',
    'Holiday period workforce reduction',
    'Inspection reschedule by municipality',
    'Material testing failure requiring re-procurement',
    'Access restriction due to adjacent construction',
    'Drawing revision pending consultant approval',
    'RFI response delay from designer',
    'Additional scope requested by client',
  ];

  // 8 minor (3-7d), 6 moderate (8-14d), 4 critical (15-30d)
  const allIndices = Array.from({ length: 80 }, (_, i) => i);
  const shuffled = allIndices.sort(() => Math.random() - 0.5);
  const delayed18 = shuffled.slice(0, 18);
  delayed18.forEach((idx, i) => {
    delayedIndices.add(idx);
    if (i < 8) delayDays.set(idx, randomInt(3, 7));
    else if (i < 14) delayDays.set(idx, randomInt(8, 14));
    else delayDays.set(idx, randomInt(15, 30));
  });

  // Create milestones in batches per phase
  const createdMilestones: Array<{
    id: string; idx: number; status: string; state: string; phase: number; value: number; vendorId: string;
    plannedStart: Date; plannedEnd: Date; completedAt: Date | null;
  }> = [];

  let globalIdx = 0;
  for (let phase = 1; phase <= 5; phase++) {
    const count = phaseCounts[phase];
    const phaseStart = phase === 1 ? 0 : (phase === 2 ? 4 : phase === 3 ? 12 : phase === 4 ? 16 : 20);
    const phaseEnd = phase === 1 ? 5 : (phase === 2 ? 14 : phase === 3 ? 18 : phase === 4 ? 22 : 24);

    // console.log(`  Phase ${phase}: Inserting milestones ${globalIdx + 1}–${globalIdx + count}...`);

    const milestoneData = [];
    for (let i = 0; i < count; i++) {
      const idx = globalIdx + i;
      const def = milestoneDefs[idx];
      const status = getMilestoneStatus(idx);
      const state = toMilestoneState(status);
      const vendorId = getVendorForMilestone(idx);

      // Spread milestones across phase duration
      const fraction = i / Math.max(count - 1, 1);
      const startMonth = phaseStart + fraction * (phaseEnd - phaseStart - 1);
      const endMonth = startMonth + (phaseEnd - phaseStart) / count;
      const plannedStart = monthOffset(startMonth);
      const plannedEnd = monthOffset(endMonth);

      // Completion date for approved milestones
      let completedAt: Date | null = null;
      if (status === 'APPROVED' && idx < completionMonths.length) {
        const baseDate = monthOffset(completionMonths[idx]);
        if (delayedIndices.has(idx)) {
          completedAt = dayOffset(plannedEnd, delayDays.get(idx)!);
        } else {
          completedAt = dayOffset(baseDate, randomInt(-3, 5));
        }
      }

      milestoneData.push({
        projectId: project.id,
        title: def.title,
        description: def.description + (delayedIndices.has(idx) && status === 'APPROVED'
          ? `\n\nDelay Reason: ${delayReasons[idx % delayReasons.length]}`
          : ''),
        state,
        value: milestoneValues[idx],
        paymentModel: 'MILESTONE_COMPLETE',
        plannedStart,
        plannedEnd,
        baselinePlannedStart: plannedStart,
        baselinePlannedEnd: plannedEnd,
        actualStart: status !== 'PENDING' ? dayOffset(plannedStart, randomInt(-2, 3)) : null,
        actualSubmission: ['APPROVED', 'IN_REVIEW', 'REJECTED'].includes(status) ? dayOffset(plannedEnd, randomInt(-5, 2)) : null,
        actualVerification: status === 'APPROVED' ? completedAt : null,
        vendorUserId: vendorId,
        sortOrder: idx,
      });

      createdMilestones.push({
        id: '', // will be filled after creation
        idx,
        status,
        state,
        phase,
        value: milestoneValues[idx],
        vendorId,
        plannedStart,
        plannedEnd,
        completedAt,
      });
    }

    // Batch create milestones for this phase
    for (const md of milestoneData) {
      const created = await prisma.milestone.create({ data: md });
      createdMilestones[createdMilestones.findIndex(m => m.id === '' && m.idx === globalIdx)].id = created.id;
      globalIdx++;
    }
    // Fix: re-index to get actual IDs
  }

  // Re-fetch all milestone IDs in order
  const allMilestones = await prisma.milestone.findMany({
    where: { projectId: project.id },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, sortOrder: true },
  });

  for (let i = 0; i < allMilestones.length; i++) {
    createdMilestones[i].id = allMilestones[i].id;
  }

  // console.log(`  ✓ 150 milestones created.`);

  // ── Step 3: Payment Eligibility ───────────────────────────────────────────
  // console.log('\nStep 3: Creating payment eligibility records...');

  // Determine which approved milestones to mark as paid (~AED 6.5M)
  let cumPaid = 0;
  const paidMilestoneIdxSet = new Set<number>();
  for (const ms of createdMilestones) {
    if (ms.status !== 'APPROVED') continue;
    if (cumPaid >= 6_500_000) break;
    cumPaid += ms.value;
    paidMilestoneIdxSet.add(ms.idx);
  }

  // 5 "ready for payment" milestones (next after paid ones)
  const approvedNotPaid = createdMilestones.filter(m => m.status === 'APPROVED' && !paidMilestoneIdxSet.has(m.idx));
  const readyIndices = new Set(approvedNotPaid.slice(0, 5).map(m => m.idx));
  // 2 "overdue" milestones (next after ready)
  const overdueIndices = new Set(approvedNotPaid.slice(5, 7).map(m => m.idx));
  // 3 "blocked" milestones from IN_REVIEW
  const blockedIndices = new Set(createdMilestones.filter(m => m.status === 'IN_REVIEW').slice(0, 3).map(m => m.idx));

  for (const ms of createdMilestones) {
    if (paidMilestoneIdxSet.has(ms.idx)) {
      // MARKED_PAID — earliest approved milestones
      await prisma.paymentEligibility.create({
        data: {
          milestoneId: ms.id,
          boqValueCompleted: ms.value,
          eligibleAmount: ms.value,
          remainingAmount: 0,
          state: EligibilityState.MARKED_PAID,
          dueDate: ms.plannedEnd,
          lastCalculatedAt: new Date(),
          markedPaidAt: ms.completedAt ? dayOffset(ms.completedAt, randomInt(5, 15)) : undefined,
          markedPaidByActorId: ownerUser.id,
          paidExplanation: 'Payment processed upon milestone verification and approval.',
        },
      });
    } else if (readyIndices.has(ms.idx)) {
      // FULLY_ELIGIBLE — ready for payment
      await prisma.paymentEligibility.create({
        data: {
          milestoneId: ms.id,
          boqValueCompleted: ms.value,
          eligibleAmount: ms.value,
          remainingAmount: ms.value,
          state: EligibilityState.FULLY_ELIGIBLE,
          dueDate: dayOffset(now, -randomInt(1, 10)),
          lastCalculatedAt: new Date(),
        },
      });
    } else if (overdueIndices.has(ms.idx)) {
      // FULLY_ELIGIBLE — overdue (due 30+ days ago)
      await prisma.paymentEligibility.create({
        data: {
          milestoneId: ms.id,
          boqValueCompleted: ms.value,
          eligibleAmount: ms.value,
          remainingAmount: ms.value,
          state: EligibilityState.FULLY_ELIGIBLE,
          dueDate: dayOffset(now, -randomInt(35, 60)),
          lastCalculatedAt: new Date(),
        },
      });
    } else if (blockedIndices.has(ms.idx)) {
      // BLOCKED — payment held pending review
      await prisma.paymentEligibility.create({
        data: {
          milestoneId: ms.id,
          blockedAmount: ms.value,
          state: EligibilityState.BLOCKED,
          dueDate: ms.plannedEnd,
          lastCalculatedAt: new Date(),
          blockReasonCode: 'EVIDENCE_UNDER_REVIEW',
          blockExplanation: 'Evidence under review — payment held pending PMC approval',
          blockedAt: dayOffset(now, -randomInt(5, 20)),
          blockedByActorId: pmcUser.id,
        },
      });
    } else if (ms.status === 'APPROVED') {
      // Remaining approved → FULLY_ELIGIBLE
      await prisma.paymentEligibility.create({
        data: {
          milestoneId: ms.id,
          boqValueCompleted: ms.value,
          eligibleAmount: ms.value,
          remainingAmount: ms.value,
          state: EligibilityState.FULLY_ELIGIBLE,
          dueDate: dayOffset(ms.plannedEnd, randomInt(5, 15)),
          lastCalculatedAt: new Date(),
        },
      });
    } else if (ms.status === 'IN_REVIEW') {
      // IN_REVIEW → DUE_PENDING_VERIFICATION
      await prisma.paymentEligibility.create({
        data: {
          milestoneId: ms.id,
          state: EligibilityState.DUE_PENDING_VERIFICATION,
          dueDate: ms.plannedEnd,
          lastCalculatedAt: new Date(),
        },
      });
    } else {
      // PENDING / REJECTED → NOT_DUE
      await prisma.paymentEligibility.create({
        data: {
          milestoneId: ms.id,
          state: EligibilityState.NOT_DUE,
          dueDate: ms.plannedEnd,
          lastCalculatedAt: new Date(),
        },
      });
    }
  }
  // console.log('  ✓ Payment eligibility records created.');

  // ── Step 4: Evidence records ──────────────────────────────────────────────
  // console.log('\nStep 4: Creating evidence records...');

  let evidenceCount = 0;
  for (const ms of createdMilestones) {
    if (ms.status === 'APPROVED') {
      // 2 evidence records: one PHOTO, one DOCUMENT
      for (const type of ['PHOTO', 'DOCUMENT'] as const) {
        const ext = type === 'PHOTO' ? 'jpg' : 'pdf';
        await prisma.evidence.create({
          data: {
            milestoneId: ms.id,
            submittedById: ms.vendorId,
            submittedAt: ms.completedAt ? dayOffset(ms.completedAt, -randomInt(5, 15)) : dayOffset(ms.plannedEnd, -5),
            qtyOrPercent: 100,
            remarks: type === 'PHOTO' ? 'Site progress photo documentation' : 'Completion report and test certificates',
            frozen: true,
            status: EvidenceStatus.APPROVED,
            reviewedAt: ms.completedAt || dayOffset(ms.plannedEnd, 0),
            reviewNote: 'Approved — meets specification requirements.',
            files: {
              create: [{
                storageKey: `stress-test/milestone-${ms.idx + 1}-${type.toLowerCase()}.${ext}`,
                fileName: `milestone-${ms.idx + 1}-${type.toLowerCase()}.${ext}`,
                mimeType: type === 'PHOTO' ? 'image/jpeg' : 'application/pdf',
                size: type === 'PHOTO' ? 2048000 : 512000,
                filePath: `/evidence/stress-test/milestone-${ms.idx + 1}-${type.toLowerCase()}.${ext}`,
              }],
            },
          },
        });
        evidenceCount++;
      }
    } else if (ms.status === 'IN_REVIEW') {
      await prisma.evidence.create({
        data: {
          milestoneId: ms.id,
          submittedById: ms.vendorId,
          submittedAt: dayOffset(ms.plannedEnd, -randomInt(1, 5)),
          qtyOrPercent: 100,
          remarks: 'Progress photo submitted for review.',
          frozen: true,
          status: EvidenceStatus.SUBMITTED,
          files: {
            create: [{
              storageKey: `stress-test/milestone-${ms.idx + 1}-photo.jpg`,
              fileName: `milestone-${ms.idx + 1}-photo.jpg`,
              mimeType: 'image/jpeg',
              size: 2048000,
              filePath: `/evidence/stress-test/milestone-${ms.idx + 1}-photo.jpg`,
            }],
          },
        },
      });
      evidenceCount++;
    } else if (ms.status === 'REJECTED') {
      await prisma.evidence.create({
        data: {
          milestoneId: ms.id,
          submittedById: ms.vendorId,
          submittedAt: dayOffset(ms.plannedEnd, -randomInt(1, 5)),
          qtyOrPercent: 80,
          remarks: 'Initial submission for review.',
          frozen: true,
          status: EvidenceStatus.REJECTED,
          reviewedAt: dayOffset(ms.plannedEnd, randomInt(1, 5)),
          reviewNote: 'Quality does not meet specification. Refer to consultant comments for rectification items.',
          files: {
            create: [{
              storageKey: `stress-test/milestone-${ms.idx + 1}-photo.jpg`,
              fileName: `milestone-${ms.idx + 1}-photo.jpg`,
              mimeType: 'image/jpeg',
              size: 2048000,
              filePath: `/evidence/stress-test/milestone-${ms.idx + 1}-photo.jpg`,
            }],
          },
        },
      });
      evidenceCount++;
    }
  }
  // console.log(`  ✓ ${evidenceCount} evidence records created.`);

  // ── Step 4b: Verification records ─────────────────────────────────────────
  // console.log('\nStep 4b: Creating verification records for approved milestones...');

  let verificationCount = 0;
  for (const ms of createdMilestones) {
    if (ms.status === 'APPROVED') {
      const verifiedAt = ms.completedAt || dayOffset(ms.plannedEnd, randomInt(1, 5));
      await prisma.verification.create({
        data: {
          milestoneId: ms.id,
          verifiedById: pmcUser.id,
          verifiedAt,
          notes: 'Work verified and approved per specification requirements.',
          qtyVerified: 100,
          valueEligibleComputed: ms.value,
        },
      });
      verificationCount++;
    }
  }
  // console.log(`  ✓ ${verificationCount} verification records created.`);

  // ── Step 5: BOQ entries ───────────────────────────────────────────────────
  // console.log('\nStep 5: Creating BOQ entries...');

  const boq = await prisma.bOQ.create({
    data: {
      projectId: project.id,
      status: 'APPROVED',
    },
  });

  let boqItemCount = 0;
  // Variance multipliers: Phase 2 = +9%, Phase 3 = -3%, others = ±1%
  const varianceMultipliers: Record<number, number> = { 1: 1.005, 2: 1.09, 3: 0.97, 4: 1.005, 5: 0.995 };

  // Track created BOQ items by phase for MilestoneBOQLink creation
  const boqItemsByPhase: Record<number, Array<{ id: string; plannedQty: number }>> = {};

  for (let phase = 1; phase <= 5; phase++) {
    const items = getPhaseBoqItems(phase);
    const variance = varianceMultipliers[phase];
    boqItemsByPhase[phase] = [];

    for (const item of items) {
      const created = await prisma.bOQItem.create({
        data: {
          boqId: boq.id,
          description: item.description,
          unit: item.unit,
          plannedQty: item.qty,
          rate: item.rate * variance, // Apply variance to rate (simulates actual cost)
          plannedValue: item.qty * item.rate,
        },
      });
      boqItemsByPhase[phase].push({ id: created.id, plannedQty: item.qty });
      boqItemCount++;
    }
  }
  // console.log(`  ✓ ${boqItemCount} BOQ line items created.`);

  // ── Step 5b: MilestoneBOQLinks ─────────────────────────────────────────────
  // console.log('\nStep 5b: Creating MilestoneBOQLinks...');

  const phaseRanges = [
    { phase: 1, start: 0, end: 19 },
    { phase: 2, start: 20, end: 59 },
    { phase: 3, start: 60, end: 89 },
    { phase: 4, start: 90, end: 129 },
    { phase: 5, start: 130, end: 149 },
  ];

  let linkCount = 0;
  for (const range of phaseRanges) {
    const phaseItems = boqItemsByPhase[range.phase] || [];
    if (phaseItems.length === 0) continue;
    const milestoneCount = range.end - range.start + 1;

    for (let i = range.start; i <= range.end; i++) {
      const itemIdx = (i - range.start) % phaseItems.length;
      const item = phaseItems[itemIdx];
      const proportionalQty = item.plannedQty / milestoneCount;

      await prisma.milestoneBOQLink.create({
        data: {
          milestoneId: createdMilestones[i].id,
          boqItemId: item.id,
          plannedQty: proportionalQty,
        },
      });
      linkCount++;
    }
  }
  // console.log(`  ✓ ${linkCount} MilestoneBOQLinks created.`);

  // Update Phase 2 verification qtyVerified for 9% overrun detection
  for (const ms of createdMilestones.filter(m => m.status === 'APPROVED' && m.phase === 2)) {
    const links = await prisma.milestoneBOQLink.findMany({ where: { milestoneId: ms.id } });
    for (const link of links) {
      await prisma.verification.updateMany({
        where: { milestoneId: ms.id },
        data: { qtyVerified: link.plannedQty * 1.09 },
      });
    }
  }
  // Phase 3 verified milestones: 3% underrun
  for (const ms of createdMilestones.filter(m => m.status === 'APPROVED' && m.phase === 3)) {
    const links = await prisma.milestoneBOQLink.findMany({ where: { milestoneId: ms.id } });
    for (const link of links) {
      await prisma.verification.updateMany({
        where: { milestoneId: ms.id },
        data: { qtyVerified: link.plannedQty * 0.97 },
      });
    }
  }
  // console.log('  ✓ Phase 2 verification qtyVerified adjusted for 9% overrun.');
  // console.log('  ✓ Phase 3 verification qtyVerified adjusted for 3% underrun.');

  // ── Step 6: Monthly cost snapshots ────────────────────────────────────────
  // console.log('\nStep 6: Creating monthly cost snapshots...');

  // Phase-specific variance: months 1-6 ±1%, months 7-14 +9%, months 15-18 -3%, months 19-24 ±1%
  const actualSpend = MONTHLY_ACTUAL_SPEND.map((val, month) => {
    if (month < 6) return Math.round(val * (0.99 + Math.random() * 0.02));
    if (month < 14) return Math.round(val * 1.09);
    if (month < 18) return Math.round(val * 0.97);
    return Math.round(val * (0.99 + Math.random() * 0.02));
  });

  let cumulativePlanned = 0;
  let cumulativeActual = 0;

  for (let month = 0; month < 24; month++) {
    cumulativePlanned += MONTHLY_PLANNED[month];
    cumulativeActual += actualSpend[month];
    const earnedValue = cumulativeActual * 0.95;

    await prisma.projectMetrics.create({
      data: {
        projectId: project.id,
        period: `2024-${String(month + 1).padStart(2, '0')}`,
        totalBudget: CONTRACT_VALUE,
        spentToDate: cumulativeActual,
        earnedValue,
        plannedValue: cumulativePlanned,
        costVariance: cumulativePlanned - cumulativeActual,
        scheduleVariance: month < 18 ? 0 : -(cumulativeActual - cumulativePlanned) * 0.1,
        cpi: cumulativeActual > 0 ? earnedValue / cumulativeActual : 1,
        spi: cumulativePlanned > 0 ? earnedValue / cumulativePlanned : 1,
        milestonesTotal: 150,
        milestonesComplete: Math.min(80, Math.round((month / 18) * 80)),
        milestonesOverdue: month > 6 ? randomInt(1, 5) : 0,
        healthStatus: month < 6 ? 'GREEN' : (month < 14 ? 'AMBER' : 'GREEN'),
      },
    });
  }
  // console.log('  ✓ 24 monthly cost snapshots created (phase-specific variances).');

  // ── Step 7: Vendor metrics ────────────────────────────────────────────────
  // console.log('\nStep 7: Creating vendor performance metrics...');

  const vendorPerformance = [
    { pct: 0.92, label: 'primary' },
    { pct: 0.74, label: 'MEP' },
    { pct: 0.61, label: 'finishing' },
  ];

  for (let vi = 0; vi < vendorUsers.length && vi < 3; vi++) {
    const perf = vendorPerformance[vi] || vendorPerformance[0];
    const vendorMilestones = createdMilestones.filter(m => m.vendorId === vendorUsers[vi].id);
    const completed = vendorMilestones.filter(m => m.status === 'APPROVED');
    const onTime = Math.round(completed.length * perf.pct);

    await prisma.vendorMetrics.create({
      data: {
        projectId: project.id,
        vendorUserId: vendorUsers[vi].id,
        period: 'all-time',
        totalMilestones: vendorMilestones.length,
        completedOnTime: onTime,
        completedLate: completed.length - onTime,
        avgDelayDays: vi === 0 ? 2.1 : (vi === 1 ? 6.8 : 11.3),
        qualityScore: vi === 0 ? 94 : (vi === 1 ? 78 : 65),
        escalationCount: vi === 0 ? 1 : (vi === 1 ? 4 : 7),
        totalValueDelivered: completed.reduce((s, m) => s + m.value, 0),
        totalValuePaid: completed.reduce((s, m) => s + m.value, 0),
      },
    });
  }
  // console.log('  ✓ Vendor metrics created.');

  // ── Step 8: Audit log entries ─────────────────────────────────────────────
  // console.log('\nStep 8: Creating audit log entries...');

  let auditCount = 0;
  const auditEntries: Array<{
    projectId: string; actorId: string; role: string; actionType: string;
    entityType: string; entityId: string; beforeJson?: string | null; afterJson?: string | null;
    reason?: string | null; createdAt: Date;
  }> = [];

  // PROJECT_CREATED
  auditEntries.push({
    projectId: project.id, actorId: ownerUser.id, role: Role.OWNER,
    actionType: 'PROJECT_CREATE', entityType: 'Project', entityId: project.id,
    afterJson: JSON.stringify({ name: PROJECT_NAME }), createdAt: projectStart,
  });

  // PROJECT_MEMBER_ADDED
  for (const ra of roleAssignments) {
    auditEntries.push({
      projectId: project.id, actorId: ownerUser.id, role: Role.OWNER,
      actionType: 'ROLE_ASSIGN', entityType: 'ProjectRole', entityId: ra.userId,
      afterJson: JSON.stringify({ userId: ra.userId, role: ra.role }),
      createdAt: dayOffset(projectStart, 1),
    });
  }

  // MILESTONE_CREATED for all 150
  for (const ms of createdMilestones) {
    const offset = Math.floor(ms.idx / 10); // Spread creation over first 15 days
    auditEntries.push({
      projectId: project.id, actorId: ownerUser.id, role: Role.OWNER,
      actionType: 'MILESTONE_CREATE', entityType: 'Milestone', entityId: ms.id,
      afterJson: JSON.stringify({ title: milestoneDefs[ms.idx].title, phase: ms.phase }),
      createdAt: dayOffset(projectStart, offset + 2),
    });
  }

  // Lifecycle entries for approved milestones (80 × 5 = 400)
  for (const ms of createdMilestones.filter(m => m.status === 'APPROVED')) {
    const submitDate = ms.completedAt ? dayOffset(ms.completedAt, -randomInt(15, 30)) : dayOffset(ms.plannedEnd, -10);
    const reviewDate = dayOffset(submitDate, randomInt(2, 7));
    const approveDate = ms.completedAt || dayOffset(reviewDate, randomInt(2, 5));
    const evidDate = dayOffset(submitDate, -randomInt(1, 5));

    auditEntries.push(
      { projectId: project.id, actorId: ms.vendorId, role: Role.VENDOR, actionType: 'MILESTONE_STATE_TRANSITION', entityType: 'Milestone', entityId: ms.id, afterJson: JSON.stringify({ state: 'SUBMITTED' }), createdAt: submitDate },
      { projectId: project.id, actorId: pmcUser.id, role: Role.PMC, actionType: 'MILESTONE_STATE_TRANSITION', entityType: 'Milestone', entityId: ms.id, afterJson: JSON.stringify({ state: 'VERIFIED' }), createdAt: reviewDate },
      { projectId: project.id, actorId: pmcUser.id, role: Role.PMC, actionType: 'MILESTONE_STATE_TRANSITION', entityType: 'Milestone', entityId: ms.id, afterJson: JSON.stringify({ state: 'CLOSED' }), createdAt: approveDate },
      { projectId: project.id, actorId: ms.vendorId, role: Role.VENDOR, actionType: 'EVIDENCE_SUBMIT', entityType: 'Evidence', entityId: ms.id, createdAt: evidDate },
      { projectId: project.id, actorId: pmcUser.id, role: Role.PMC, actionType: 'EVIDENCE_APPROVE', entityType: 'Evidence', entityId: ms.id, createdAt: reviewDate },
    );
  }

  // In-review milestones (20 × 3 = 60)
  for (const ms of createdMilestones.filter(m => m.status === 'IN_REVIEW')) {
    const submitDate = dayOffset(ms.plannedEnd, -randomInt(3, 10));
    const evidDate = dayOffset(submitDate, -randomInt(1, 3));

    auditEntries.push(
      { projectId: project.id, actorId: ms.vendorId, role: Role.VENDOR, actionType: 'MILESTONE_STATE_TRANSITION', entityType: 'Milestone', entityId: ms.id, afterJson: JSON.stringify({ state: 'SUBMITTED' }), createdAt: submitDate },
      { projectId: project.id, actorId: ms.vendorId, role: Role.VENDOR, actionType: 'EVIDENCE_SUBMIT', entityType: 'Evidence', entityId: ms.id, createdAt: evidDate },
      { projectId: project.id, actorId: pmcUser.id, role: Role.PMC, actionType: 'MILESTONE_STATE_TRANSITION', entityType: 'Milestone', entityId: ms.id, afterJson: JSON.stringify({ state: 'IN_REVIEW' }), createdAt: dayOffset(submitDate, 1) },
    );
  }

  // Rejected milestones (10 × 5 = 50)
  for (const ms of createdMilestones.filter(m => m.status === 'REJECTED')) {
    const submitDate = dayOffset(ms.plannedEnd, -randomInt(5, 15));
    const rejectDate = dayOffset(submitDate, randomInt(3, 7));

    auditEntries.push(
      { projectId: project.id, actorId: ms.vendorId, role: Role.VENDOR, actionType: 'MILESTONE_STATE_TRANSITION', entityType: 'Milestone', entityId: ms.id, afterJson: JSON.stringify({ state: 'SUBMITTED' }), createdAt: submitDate },
      { projectId: project.id, actorId: pmcUser.id, role: Role.PMC, actionType: 'MILESTONE_STATE_TRANSITION', entityType: 'Milestone', entityId: ms.id, afterJson: JSON.stringify({ state: 'IN_REVIEW' }), createdAt: dayOffset(submitDate, 1) },
      { projectId: project.id, actorId: pmcUser.id, role: Role.PMC, actionType: 'MILESTONE_STATE_TRANSITION', entityType: 'Milestone', entityId: ms.id, afterJson: JSON.stringify({ state: 'REJECTED' }), reason: 'Quality does not meet specification requirements.', createdAt: rejectDate },
      { projectId: project.id, actorId: ms.vendorId, role: Role.VENDOR, actionType: 'EVIDENCE_SUBMIT', entityType: 'Evidence', entityId: ms.id, createdAt: dayOffset(submitDate, -1) },
      { projectId: project.id, actorId: pmcUser.id, role: Role.PMC, actionType: 'EVIDENCE_REJECT', entityType: 'Evidence', entityId: ms.id, reason: 'Submission does not demonstrate completion to required standard.', createdAt: rejectDate },
    );
  }

  // BOQ variance flagged entries for Phase 2 overrun items
  const phase2Items = getPhaseBoqItems(2);
  for (const item of phase2Items) {
    if (item.rate * item.qty * 0.09 > 50000) { // Only flag significant overruns
      auditEntries.push({
        projectId: project.id, actorId: pmcUser.id, role: Role.PMC,
        actionType: 'BOQ_ITEM_UPDATE', entityType: 'BOQItem', entityId: boq.id,
        afterJson: JSON.stringify({
          description: item.description,
          variance: '9% over budget',
          note: 'Concrete unit rate increased from AED 320/m³ to AED 358/m³ — approved variation order VO-007',
        }),
        createdAt: monthOffset(14),
      });
    }
  }

  // DELAY_FLAGGED for delayed milestones
  Array.from(delayedIndices).forEach((idx) => {
    const ms = createdMilestones[idx];
    if (ms) {
      auditEntries.push({
        projectId: project.id, actorId: pmcUser.id, role: Role.PMC,
        actionType: 'MILESTONE_UPDATE', entityType: 'Milestone', entityId: ms.id,
        afterJson: JSON.stringify({
          delayDays: delayDays.get(idx),
          dueDate: ms.plannedEnd.toISOString(),
          completedAt: ms.completedAt?.toISOString(),
          reason: 'Delay flagged by system',
        }),
        createdAt: ms.completedAt || dayOffset(ms.plannedEnd, delayDays.get(idx)!),
      });
    }
  });

  // Payment eligibility events — diversified by state
  for (const ms of createdMilestones.filter(m => m.status === 'APPROVED')) {
    const completedAt = ms.completedAt || dayOffset(ms.plannedEnd, 5);

    if (paidMilestoneIdxSet.has(ms.idx)) {
      // MARKED_PAID
      auditEntries.push({
        projectId: project.id, actorId: ownerUser.id, role: Role.OWNER,
        actionType: 'ELIGIBILITY_MARKED_PAID', entityType: 'PaymentEligibility', entityId: ms.id,
        afterJson: JSON.stringify({ state: 'MARKED_PAID', amount: ms.value }),
        createdAt: dayOffset(completedAt, randomInt(5, 15)),
      });
    } else {
      // FULLY_ELIGIBLE
      auditEntries.push({
        projectId: project.id, actorId: pmcUser.id, role: Role.PMC,
        actionType: 'ELIGIBILITY_STATE_CHANGE', entityType: 'PaymentEligibility', entityId: ms.id,
        afterJson: JSON.stringify({ state: 'FULLY_ELIGIBLE', amount: ms.value }),
        createdAt: dayOffset(completedAt, randomInt(1, 3)),
      });
    }
  }

  // Blocked payment events
  for (const ms of createdMilestones.filter(m => blockedIndices.has(m.idx))) {
    auditEntries.push({
      projectId: project.id, actorId: pmcUser.id, role: Role.PMC,
      actionType: 'ELIGIBILITY_STATE_CHANGE', entityType: 'PaymentEligibility', entityId: ms.id,
      afterJson: JSON.stringify({ state: 'BLOCKED', reason: 'Evidence under review' }),
      createdAt: dayOffset(now, -randomInt(5, 20)),
    });
  }

  // Sort by date and batch insert
  auditEntries.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  // Insert in batches of 100
  const BATCH_SIZE = 100;
  for (let i = 0; i < auditEntries.length; i += BATCH_SIZE) {
    const batch = auditEntries.slice(i, i + BATCH_SIZE);
    await prisma.auditLog.createMany({ data: batch });
    if ((i + BATCH_SIZE) % 200 === 0 || i + BATCH_SIZE >= auditEntries.length) {
      // console.log(`  Audit log: ${Math.min(i + BATCH_SIZE, auditEntries.length)}/${auditEntries.length} entries written...`);
    }
  }
  auditCount = auditEntries.length;
  // console.log(`  ✓ ${auditCount} audit log entries created.`);

  // ── Step 9: Eligibility events ──────────────────────────────────────────────
  // console.log('\nStep 9: Creating eligibility events...');

  let eventCount = 0;
  for (const ms of createdMilestones.filter(m => m.status === 'APPROVED')) {
    const pe = await prisma.paymentEligibility.findUnique({ where: { milestoneId: ms.id } });
    if (!pe) continue;
    const completedAt = ms.completedAt || dayOffset(ms.plannedEnd, 5);

    if (paidMilestoneIdxSet.has(ms.idx)) {
      await prisma.eligibilityEvent.createMany({
        data: [
          {
            paymentEligibilityId: pe.id, eventType: 'VERIFICATION_CREATED',
            fromState: 'NOT_DUE', toState: 'FULLY_ELIGIBLE',
            actorId: pmcUser.id, actorRole: Role.PMC,
            eligibleAmountBefore: 0, eligibleAmountAfter: ms.value,
            reasonCode: 'MILESTONE_VERIFIED', explanation: 'Milestone verified and eligible for payment.',
            createdAt: dayOffset(completedAt, 1),
          },
          {
            paymentEligibilityId: pe.id, eventType: 'MILESTONE_STATE_CHANGED',
            fromState: 'FULLY_ELIGIBLE', toState: 'MARKED_PAID',
            actorId: ownerUser.id, actorRole: Role.OWNER,
            eligibleAmountBefore: ms.value, eligibleAmountAfter: ms.value,
            reasonCode: 'PAYMENT_RELEASED', explanation: 'Payment released to vendor.',
            createdAt: dayOffset(completedAt, randomInt(5, 15)),
          },
        ],
      });
      eventCount += 2;
    } else {
      await prisma.eligibilityEvent.create({
        data: {
          paymentEligibilityId: pe.id, eventType: 'VERIFICATION_CREATED',
          fromState: 'NOT_DUE', toState: 'FULLY_ELIGIBLE',
          actorId: pmcUser.id, actorRole: Role.PMC,
          eligibleAmountBefore: 0, eligibleAmountAfter: ms.value,
          reasonCode: 'MILESTONE_VERIFIED', explanation: 'Milestone verified and eligible for payment.',
          createdAt: dayOffset(completedAt, 1),
        },
      });
      eventCount++;
    }
  }

  for (const ms of createdMilestones.filter(m => blockedIndices.has(m.idx))) {
    const pe = await prisma.paymentEligibility.findUnique({ where: { milestoneId: ms.id } });
    if (!pe) continue;
    await prisma.eligibilityEvent.create({
      data: {
        paymentEligibilityId: pe.id, eventType: 'EVIDENCE_SUBMITTED',
        fromState: 'NOT_DUE', toState: 'BLOCKED',
        actorId: pmcUser.id, actorRole: Role.PMC,
        eligibleAmountBefore: 0, eligibleAmountAfter: 0,
        reasonCode: 'EVIDENCE_UNDER_REVIEW', explanation: 'Evidence under review — payment held pending PMC approval.',
        createdAt: dayOffset(now, -randomInt(5, 20)),
      },
    });
    eventCount++;
  }
  // console.log(`  ✓ ${eventCount} eligibility events created.`);

  // ── Summary ───────────────────────────────────────────────────────────────
  // console.log('\n' + '═'.repeat(60));
  // console.log('  ✓ Project created: Marina Tower — Dubai (Stress Test)');
  // console.log(`  ✓ Owner: ${ownerUser.email}`);
  // console.log(`  ✓ PMC: ${pmcUser.email}`);
  // console.log(`  ✓ Vendors: ${vendorUsers.map(v => v.email).join(', ')}`);
  // console.log(`  ✓ Milestones seeded: 150`);
  // console.log(`  ✓ Verifications: ${verificationCount}`);
  // console.log(`  ✓ BOQ line items: ${boqItemCount}`);
  // console.log(`  ✓ MilestoneBOQLinks: ${linkCount}`);
  // console.log(`  ✓ Evidence records: ${evidenceCount}`);
  // console.log(`  ✓ Eligibility events: ${eventCount}`);
  // console.log(`  ✓ Audit log entries: ${auditCount}`);
  // console.log(`  ✓ Monthly cost snapshots: 24 (phase-specific variances)`);
  // console.log(`  ✓ Login with your existing Owner/PMC/Vendor credentials to view the project`);
  // console.log('═'.repeat(60));
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

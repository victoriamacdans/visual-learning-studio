import type { StudyModuleId } from '../config/appConfig';
import type { EngineComponentId } from '../types/tutor';

export interface PdfDocumentPage {
  readonly pageNumber: number;
  readonly sectionTitle: string;
  readonly summary: string;
  readonly keyFormula: {
    readonly label: string;
    readonly expression: string;
    readonly variables: string;
  };
  readonly keyTakeaways: readonly string[];
}

export interface EngineStageInfo {
  readonly id: EngineComponentId;
  readonly name: string;
  readonly shortLabel: string;
  readonly stationCode: string;
  readonly role: string;
  readonly pressureNote: string;
  readonly temperatureNote: string;
}

export interface StudyModule {
  readonly id: StudyModuleId;
  readonly label: string;
  readonly documentTitle: string;
  readonly defaultStageId: EngineStageInfo['id'];
  readonly pages: readonly PdfDocumentPage[];
  readonly starterQuestions: readonly string[];
}

export const ENGINE_STAGES: readonly EngineStageInfo[] = [
  {
    id: 'intake',
    name: 'Air Intake',
    shortLabel: 'Intake',
    stationCode: 'Station 0–1',
    role: 'Captures ambient freestream air and decelerates it smoothly with minimal total pressure loss before reaching the fan face.',
    pressureNote: 'Ambient ~101 kPa rising slightly via ram recovery',
    temperatureNote: 'Ambient ~288 K (ISA sea level)',
  },
  {
    id: 'fan',
    name: 'Bypass Fan',
    shortLabel: 'Fan',
    stationCode: 'Station 2–13',
    role: 'Accelerates a massive stream of cool air into the outer bypass duct while pre-charging the core engine.',
    pressureNote: 'Moderate fan pressure ratio (~1.5:1)',
    temperatureNote: 'Slight compression heating (~325 K)',
  },
  {
    id: 'lp-compressor',
    name: 'Low-Pressure Compressor',
    shortLabel: 'LP Comp',
    stationCode: 'Station 2–2.5',
    role: 'Three axial booster stages mounted on the low-pressure spool raise core air pressure before entering the high-pressure core.',
    pressureNote: 'Booster pressure ratio (~2.5:1 to 4:1)',
    temperatureNote: 'Warm compression rise (~420 K)',
  },
  {
    id: 'hp-compressor',
    name: 'High-Pressure Compressor',
    shortLabel: 'HP Comp',
    stationCode: 'Station 2.5–3',
    role: 'Fast-spinning concentric rotor and stator rows compress core air to peak cycle pressure while preventing boundary-layer stall.',
    pressureNote: 'Combined core overall pressure ratio (30:1 to 45:1)',
    temperatureNote: 'Adiabatic rise up to ~850 K',
  },
  {
    id: 'combustor',
    name: 'Combustion Chamber',
    shortLabel: 'Combustor',
    stationCode: 'Station 3–4',
    role: 'Atomizes fuel into swirling high-pressure air and burns it continuously at near-constant pressure inside a film-cooled annular liner.',
    pressureNote: 'Near-constant high pressure (~4% loss)',
    temperatureNote: 'Peak turbine entry temp ~1,650 K',
  },
  {
    id: 'turbine',
    name: 'Turbine Stages',
    shortLabel: 'Turbine',
    stationCode: 'Station 4–5',
    role: 'High-pressure and low-pressure turbine stages extract shaft work from expanding hot gas to drive the coaxial compressors and front fan.',
    pressureNote: 'Expanding pressure drop across HP & LP stages',
    temperatureNote: 'Gas cools from ~1,650 K to ~920 K',
  },
  {
    id: 'nozzle',
    name: 'Exhaust Nozzle',
    shortLabel: 'Nozzle',
    stationCode: 'Station 7–9',
    role: 'Accelerates remaining core and bypass gas around the tailcone plug to high exit velocity, converting thermal pressure into forward thrust.',
    pressureNote: 'Expands toward ambient static pressure',
    temperatureNote: 'Core plume ~680 K / bypass ~330 K',
  },
  {
    id: 'bypass-duct',
    name: 'Bypass Duct',
    shortLabel: 'Bypass Duct',
    stationCode: 'Station 13–19',
    role: 'Annular nacelle channel guiding cool fan air around the hot core to deliver high-efficiency subsonic thrust and acoustic shielding.',
    pressureNote: 'Low-loss cold duct (~1.45:1 total/ambient)',
    temperatureNote: 'Cool bypass stream (~325 K)',
  },
];

export const STUDY_MODULES: readonly StudyModule[] = [
  {
    id: 'turbofan',
    label: 'Turbofan Engine',
    documentTitle: 'Turbofan_Fundamentals.pdf',
    defaultStageId: 'fan',
    pages: [
      {
        pageNumber: 1,
        sectionTitle: 'Momentum Thrust & Bypass Mass Flow',
        summary:
          'A high-bypass turbofan produces thrust by accelerating a large mass of air by a moderate velocity increment rather than accelerating a small core stream to extreme speed.',
        keyFormula: {
          label: 'Net Propulsion Thrust Equation',
          expression: 'F = ṁ_core(V_e - V_0) + ṁ_bypass(V_b - V_0) + (P_e - P_0)A_e',
          variables: 'ṁ: mass flow (kg/s) · V_e, V_b: exit velocities · V_0: flight speed',
        },
        keyTakeaways: [
          'Increasing bypass ratio improves propulsive efficiency at subsonic cruise speeds.',
          'Cold bypass air surrounding the hot core plume also lowers acoustic jet noise.',
          'Concentric low-pressure and high-pressure spools rotate independently for optimal blade speed.',
        ],
      },
      {
        pageNumber: 2,
        sectionTitle: 'Compressor-Turbine Mechanical Coupling',
        summary:
          'Because a jet engine operates as a continuous open Brayton cycle, the turbine must extract just enough shaft work to drive the fan and compressor stages.',
        keyFormula: {
          label: 'Specific Shaft Work Balance',
          expression: 'ṁ_t · c_p,g · ΔT_turbine = ṁ_c · c_p,a · ΔT_compressor / η_mech',
          variables: 'c_p: specific heat capacity · ΔT: total temperature change · η_mech: shaft efficiency',
        },
        keyTakeaways: [
          'Only the pressure remaining after the turbine is available for nozzle expansion.',
          'Multi-stage axial compressors require careful stall margin control during throttle transients.',
          'Single-crystal nickel superalloys and film cooling protect high-pressure turbine blades.',
        ],
      },
      {
        pageNumber: 3,
        sectionTitle: 'Bypass Ratio & Fuel Economy Trade-offs',
        summary:
          'Modern commercial engines reach bypass ratios of 9:1 to 12:1, trading larger fan diameter and nacelle drag for substantial reductions in thrust-specific fuel consumption.',
        keyFormula: {
          label: 'Propulsive Efficiency Approximation',
          expression: 'η_p ≈ 2 / (1 + V_e / V_0)',
          variables: 'η_p approaches 100% as jet exit velocity V_e nears flight speed V_0',
        },
        keyTakeaways: [
          'Geared turbofans decouple fan RPM from low-pressure turbine RPM.',
          'Lower specific thrust reduces kinetic energy wasted in the wake.',
          'Nacelle clearance limits fan diameter on low-wing airframes.',
        ],
      },
    ],
    starterQuestions: [
      'Why does a high bypass ratio save fuel?',
      'How do the compressor and turbine stay balanced?',
      'Which stage reaches the highest temperature?',
    ],
  },
  {
    id: 'brayton-cycle',
    label: 'Brayton Cycle',
    documentTitle: '02_Gas_Turbine_Brayton_Thermodynamics.pdf',
    defaultStageId: 'combustor',
    pages: [
      {
        pageNumber: 1,
        sectionTitle: 'Ideal Four-Process Open Cycle',
        summary:
          'Gas turbine engines follow the open Brayton cycle: isentropic compression (1→2), constant-pressure heat addition (2→3), isentropic expansion (3→4), and exhaust rejection.',
        keyFormula: {
          label: 'Ideal Thermal Efficiency',
          expression: 'η_th = 1 - (1 / r_p^((γ - 1)/γ))',
          variables: 'r_p: overall pressure ratio (P_3 / P_2) · γ: specific heat ratio (~1.4 for air)',
        },
        keyTakeaways: [
          'Higher overall pressure ratio directly increases ideal cycle thermal efficiency.',
          'Unlike piston engines, combustion happens continuously in a steady-flow annular chamber.',
          'Real engines exhibit entropy rise in compressor/turbine blades and minor combustor pressure drop.',
        ],
      },
      {
        pageNumber: 2,
        sectionTitle: 'Turbine Entry Temperature Limits',
        summary:
          'Cycle specific work scales strongly with peak combustor temperature T_4, constrained primarily by turbine blade metallurgy and internal cooling airflow.',
        keyFormula: {
          label: 'Optimum Work Pressure Ratio',
          expression: 'r_p,opt = (T_4 / T_0)^(γ / (2(γ - 1)))',
          variables: 'T_4: turbine inlet temperature · T_0: ambient inlet temperature',
        },
        keyTakeaways: [
          'Cooling air bled from the compressor bypasses combustion, slightly penalizing cycle efficiency.',
          'Thermal barrier ceramic coatings allow gas temperatures above blade alloy melting points.',
          'Temperature-entropy (T-s) diagrams reveal diverging isobar lines at high pressure.',
        ],
      },
    ],
    starterQuestions: [
      'Why does constant-pressure combustion work better here than constant-volume?',
      'How does pressure ratio affect Brayton efficiency?',
      'What limits peak combustor temperature?',
    ],
  },
  {
    id: 'supersonic-nozzle',
    label: 'Supersonic Nozzle',
    documentTitle: '03_Convergent_Divergent_Nozzle_Flow.pdf',
    defaultStageId: 'nozzle',
    pages: [
      {
        pageNumber: 1,
        sectionTitle: 'Choked Throat & Sonic Transition',
        summary:
          'In a convergent-divergent (de Laval) nozzle, subsonic flow accelerates to Mach 1 at the minimum-area throat, then continues accelerating supersonically in the diverging bell.',
        keyFormula: {
          label: 'Area-Velocity Differential Relation',
          expression: 'dA / A = (M² - 1) · (dV / V)',
          variables: 'A: cross-sectional area · M: local Mach number · V: flow velocity',
        },
        keyTakeaways: [
          'When M < 1, decreasing area (dA < 0) increases velocity (dV > 0).',
          'When M > 1, increasing area (dA > 0) is required to accelerate flow further.',
          'Choked mass flow at the throat depends only on upstream stagnation pressure and temperature.',
        ],
      },
      {
        pageNumber: 2,
        sectionTitle: 'Overexpanded vs. Underexpanded Plumes',
        summary:
          'Optimal nozzle thrust occurs when static exit pressure P_e matches ambient pressure P_0; mismatches create oblique shock diamonds or expansion fans outside the nozzle.',
        keyFormula: {
          label: 'Pressure Thrust Correction Term',
          expression: 'F_pressure = (P_e - P_0) · A_e',
          variables: 'P_e: exit plane static pressure · P_0: ambient pressure · A_e: exit area',
        },
        keyTakeaways: [
          'At sea level, fixed high-altitude nozzles are overexpanded and show visible shock diamonds.',
          'Variable-geometry petals adjust throat and exit areas across Mach regimes.',
          'Underexpanded exhaust continues expanding radially beyond the nozzle lip.',
        ],
      },
    ],
    starterQuestions: [
      'Why must a supersonic nozzle widen after the throat?',
      'What causes shock diamonds in jet exhaust?',
      'What does choked flow mean at Mach 1?',
    ],
  },
  {
    id: 'thrust-vectoring',
    label: 'Thrust Vectoring',
    documentTitle: '04_Vector_Nozzle_Flight_Control.pdf',
    defaultStageId: 'nozzle',
    pages: [
      {
        pageNumber: 1,
        sectionTitle: 'Deflected Exhaust & Pitch/Yaw Moments',
        summary:
          'Thrust vectoring pivots the exhaust stream by an angle δ to generate control moments independent of aerodynamic control surface airflow.',
        keyFormula: {
          label: 'Vectored Force Components',
          expression: 'F_axial = F · cos(δ)   |   F_normal = F · sin(δ)',
          variables: 'F: gross nozzle thrust · δ: mechanical or fluidic deflection angle',
        },
        keyTakeaways: [
          'Effective at high angles of attack and post-stall regimes where elevators lose authority.',
          'Small deflection angles yield substantial pitching moment due to long tail moment arm.',
          '2D pitch-only paddles differ structurally from 3D axisymmetric multi-axis actuators.',
        ],
      },
      {
        pageNumber: 2,
        sectionTitle: 'Thermal Loads on Gimbaled Petals',
        summary:
          'Actuating nozzle petals in high-velocity afterburning exhaust demands cooled actuators, ceramic matrix composites, and rapid feedback limits.',
        keyFormula: {
          label: 'Control Pitch Moment',
          expression: 'M_pitch = F · sin(δ) · L_arm',
          variables: 'L_arm: distance from aircraft center of gravity to nozzle hinge',
        },
        keyTakeaways: [
          'Axial thrust loss scales gently with 1 - cos(δ) for small angles (e.g., < 2% at 10°).',
          'Flight computers blend aerodynamic surfaces with nozzle vectoring seamlessly.',
          'Fluidic thrust vectoring injects secondary air to steer the plume without heavy hinges.',
        ],
      },
    ],
    starterQuestions: [
      'How much forward thrust is lost when vectoring by 15 degrees?',
      'Why is thrust vectoring useful at low airspeed?',
      'How do 2D and 3D vectoring nozzles differ?',
    ],
  },
];

export function getStudyModuleById(moduleId: StudyModuleId): StudyModule {
  return STUDY_MODULES.find((mod) => mod.id === moduleId) ?? STUDY_MODULES[0];
}

import { APP_CONFIG, type PanelId } from '../config/appConfig';

export interface SimplifiedEngineTelemetry {
  readonly rpmPercent: number;
  readonly egtCelsius: number;
  readonly machEstimate: number;
  readonly thrustKn: number;
}

/**
 * Clamps a requested page number within valid [1, totalPages] bounds.
 */
export function clampPage(page: number, totalPages: number): number {
  if (totalPages <= 0) {
    return 1;
  }
  return Math.max(1, Math.min(totalPages, Math.round(page)));
}

/**
 * Computes the next PDF zoom percentage constrained by APP_CONFIG limits.
 */
export function stepZoom(
  currentZoom: number,
  direction: 'in' | 'out' | 'reset',
): number {
  const { initialZoomPercent, minZoomPercent, maxZoomPercent, zoomStepPercent } =
    APP_CONFIG.pdfDefaults;

  if (direction === 'reset') {
    return initialZoomPercent;
  }

  const delta = direction === 'in' ? zoomStepPercent : -zoomStepPercent;
  return Math.max(minZoomPercent, Math.min(maxZoomPercent, currentZoom + delta));
}

/**
 * Computes simplified educational telemetry metrics from throttle percentage.
 * NOTE: This is an illustrative educational approximation for UI demonstration,
 * not a physically accurate thermodynamic or CFD engine simulation.
 */
export function computeSimplifiedEngineTelemetry(
  throttlePercent: number,
): SimplifiedEngineTelemetry {
  const { minThrottlePercent, maxThrottlePercent } = APP_CONFIG.simulationDefaults;
  const clamped = Math.max(minThrottlePercent, Math.min(maxThrottlePercent, throttlePercent));
  const normalized = (clamped - minThrottlePercent) / (maxThrottlePercent - minThrottlePercent);

  const rpmPercent = Math.round((28 + normalized * 72) * 10) / 10;
  const egtCelsius = Math.round(410 + Math.pow(normalized, 1.15) * 510);
  const machEstimate = Math.round((0.18 + normalized * 0.72) * 100) / 100;
  const thrustKn = Math.round((12 + Math.pow(normalized, 1.35) * 128) * 10) / 10;

  return {
    rpmPercent,
    egtCelsius,
    machEstimate,
    thrustKn,
  };
}

/**
 * Determines whether a given studio panel should be rendered in the current viewport mode.
 */
export function resolvePanelVisibility(
  panelId: PanelId,
  expandedPanel: PanelId | null,
  mobileActivePanel: PanelId,
  isDesktop: boolean,
): boolean {
  if (!isDesktop) {
    return mobileActivePanel === panelId;
  }
  if (expandedPanel !== null) {
    return expandedPanel === panelId;
  }
  return true;
}

/**
 * Main UI Entry Point
 * Orchestrates initialization of all UI modules for DeepNest
 * This file replaces the monolithic page.js with modular TypeScript components
 */

// Type imports
import type {
  UIConfig,
  ConfigObject,
  DeepNestInstance,
  SvgParserInstance,
  RactiveInstance,
  NestViewData,
  NestingProgress,
  PartsViewData,
} from "./types/index.js";
import { IPC_CHANNELS } from "./types/index.js";

// Service imports
import {
  ConfigService,
  createConfigService,
  BOOLEAN_CONFIG_KEYS,
} from "./services/config.service.js";
import {
  PresetService,
  createPresetService,
} from "./services/preset.service.js";
import {
  ImportService,
  createImportService,
} from "./services/import.service.js";
import {
  ExportService,
  createExportService,
} from "./services/export.service.js";
import {
  NestingService,
  createNestingService,
} from "./services/nesting.service.js";

// Component imports
import {
  NavigationService,
  createNavigationService,
} from "./components/navigation.js";
import {
  PartsViewService,
  createPartsViewService,
} from "./components/parts-view.js";
import {
  NestViewService,
  createNestViewService,
} from "./components/nest-view.js";
import {
  SheetDialogService,
  createSheetDialogService,
} from "./components/sheet-dialog.js";

// Utility imports
import { message } from "./utils/ui-helpers.js";
import { getElement, getElements } from "./utils/dom-utils.js";

/**
 * IPC renderer interface for Electron communication
 */
interface IpcRenderer {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  send(channel: string, ...args: unknown[]): void;
  on(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => void,
  ): void;
}

/**
 * Helper type for casting getSync() results
 */
type ConfigResult = UIConfig;

/**
 * Window is already augmented in index.d.ts
 * We use type assertion when setting globals that have different types
 */
declare const Ractive: { DEBUG: boolean };
declare const interact: (selector: string) => {
  resizable(options: {
    preserveAspectRatio: boolean;
    edges: { left: boolean; right: boolean; bottom: boolean; top: boolean };
  }): {
    on(
      event: string,
      handler: (event: { rect: { width: number } }) => void,
    ): void;
  };
};

/**
 * Node.js module interfaces for Electron context
 */
declare function require(module: string): unknown;

/**
 * Global DeepNest instance (set by deepnest.js)
 * Access via getDeepNest() helper to get proper typing
 */
declare let DeepNest: DeepNestInstance;

/**
 * Global SvgParser instance
 */
declare let SvgParser: SvgParserInstance;

/**
 * Get the DeepNest global with proper typing
 */
function getDeepNest(): DeepNestInstance {
  return DeepNest;
}

/**
 * Get the SvgParser global with proper typing
 */
function getSvgParser(): SvgParserInstance {
  return SvgParser;
}

/**
 * Execute a callback when the DOM is ready
 * @param fn - The callback function to execute
 */
function ready(fn: () => void | Promise<void>): void {
  if (document.readyState !== "loading") {
    fn();
  } else {
    document.addEventListener("DOMContentLoaded", fn);
  }
}

/**
 * Module instances for cross-module communication
 */
let configService: ConfigService;
let presetService: PresetService;
let importService: ImportService;
let exportService: ExportService;
let nestingService: NestingService;
let navigationService: NavigationService;
let partsViewService: PartsViewService;
let nestViewService: NestViewService;
let sheetDialogService: SheetDialogService;

/**
 * Electron and Node.js module references
 */
let ipcRenderer: IpcRenderer;
let electronRemote: {
  dialog: { showOpenDialog: unknown; showSaveDialogSync: unknown };
  getGlobal: (name: string) => string | undefined;
};
let fs: unknown;
let FormData: new () => unknown;
let axios: { default: { post: unknown } };
let path: {
  extname: (p: string) => string;
  basename: (p: string) => string;
  dirname: (p: string) => string;
};
let svgPreProcessor: {
  loadSvgString: (
    svg: string,
    scale: number,
  ) => { success: boolean; result: string };
};

/**
 * Resize function for parts list
 * Adjusts the parts table headers when resizing
 */
function resize(event?: { rect: { width: number } }): void {
  const parts = getElement<HTMLElement>("#parts");

  if (event && parts) {
    parts.style.width = event.rect.width + "px";
  }

  const headers = getElements<HTMLTableCellElement>("#parts table th");
  headers.forEach((th) => {
    const span = th.querySelector("span");
    if (span) {
      (span as HTMLElement).style.width = th.offsetWidth + "px";
    }
  });
}

/**
 * Update the config form UI with current values
 * @param c - The configuration object
 */
function updateForm(c: UIConfig): void {
  // Update unit radio buttons
  let unitInput: HTMLInputElement | null;
  if (c.units === "inch") {
    unitInput = document.querySelector("#configform input[value=inch]");
  } else {
    unitInput = document.querySelector("#configform input[value=mm]");
  }

  if (unitInput) {
    unitInput.checked = true;
  }

  // Update unit labels
  const labels = document.querySelectorAll("span.unit-label");
  labels.forEach((l) => {
    (l as HTMLElement).innerText = c.units;
  });

  // Update scale input
  const scaleInput = document.querySelector<HTMLInputElement>("#inputscale");
  if (scaleInput) {
    if (c.units === "inch") {
      scaleInput.value = String(c.scale);
    } else {
      // mm
      scaleInput.value = String(c.scale / 25.4);
    }
  }

  // Update all other config inputs
  const inputs = document.querySelectorAll("#config input, #config select");
  inputs.forEach((i) => {
    const inputElement = i as HTMLInputElement | HTMLSelectElement;
    const inputId = inputElement.getAttribute("id");

    // Skip preset-related inputs
    if (inputId && ["presetSelect", "presetName"].includes(inputId)) {
      return;
    }

    const key = inputElement.getAttribute("data-config") as
      | keyof UIConfig
      | null;
    if (!key) {
      return;
    }

    if (key === "units" || key === "scale") {
      return;
    }

    const value = c[key];

    if (inputElement.getAttribute("data-conversion") === "true") {
      const scaleValue = scaleInput ? Number(scaleInput.value) : c.scale;
      inputElement.value = String((value as number) / scaleValue);
    } else if (BOOLEAN_CONFIG_KEYS.includes(key)) {
      (inputElement as HTMLInputElement).checked = value as boolean;
    } else if (value !== undefined) {
      inputElement.value = String(value);
    }
  });
}

/**
 * Load presets into the dropdown
 */
async function loadPresetList(): Promise<void> {
  const presets = await presetService.loadPresets();
  const presetSelect = getElement<HTMLSelectElement>("#presetSelect");

  if (!presetSelect) {
    return;
  }

  // Clear dropdown (except first option)
  while (presetSelect.options.length > 1) {
    presetSelect.remove(1);
  }

  // Add presets to dropdown
  for (const name in presets) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    presetSelect.appendChild(option);
  }
}

/**
 * Initialize preset modal functionality
 */
function initializePresetModal(): void {
  const savePresetBtn = getElement<HTMLElement>("#savePresetBtn");
  const loadPresetBtn = getElement<HTMLElement>("#loadPresetBtn");
  const deletePresetBtn = getElement<HTMLElement>("#deletePresetBtn");
  const presetSelect = getElement<HTMLSelectElement>("#presetSelect");
  const presetModal = getElement<HTMLElement>("#preset-modal");
  const confirmSavePresetBtn = getElement<HTMLElement>("#confirmSavePreset");
  const presetNameInput = getElement<HTMLInputElement>("#presetName");

  if (!presetModal) {
    return;
  }

  const closeModalBtn = presetModal.querySelector(".close");

  // Save preset button click - opens modal
  if (savePresetBtn) {
    savePresetBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (presetNameInput) {
        presetNameInput.value = "";
      }
      presetModal.style.display = "block";
      document.body.classList.add("modal-open");
      if (presetNameInput) {
        presetNameInput.focus();
      }
    });
  }

  // Close modal when clicking X
  if (closeModalBtn) {
    closeModalBtn.addEventListener("click", (e) => {
      e.preventDefault();
      presetModal.style.display = "none";
      document.body.classList.remove("modal-open");
    });
  }

  // Close modal when clicking outside
  window.addEventListener("click", (event) => {
    if (event.target === presetModal) {
      presetModal.style.display = "none";
      document.body.classList.remove("modal-open");
    }
  });

  // Confirm save preset
  if (confirmSavePresetBtn) {
    confirmSavePresetBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      const name = presetNameInput?.value.trim() || "";
      if (!name) {
        alert("Please enter a preset name");
        return;
      }

      try {
        await presetService.savePreset(
          name,
          configService.getSync() as unknown as ConfigResult,
        );
        presetModal.style.display = "none";
        document.body.classList.remove("modal-open");
        await loadPresetList();
        if (presetSelect) {
          presetSelect.value = name;
        }
        message("Preset saved successfully!");
      } catch {
        message("Error saving preset", true);
      }
    });
  }

  // Load preset button click
  if (loadPresetBtn) {
    loadPresetBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      const selectedPreset = presetSelect?.value || "";
      if (!selectedPreset) {
        message("Please select a preset to load");
        return;
      }

      try {
        const presetConfig = await presetService.getPreset(selectedPreset);

        if (presetConfig) {
          // Preserve user profile
          const tempAccess = configService.getSync("access_token") as
            | string
            | undefined;
          const tempId = configService.getSync("id_token") as
            | string
            | undefined;

          // Apply preset settings
          configService.setSync(presetConfig);

          // Restore user profile
          if (tempAccess !== undefined) {
            configService.setSync("access_token", tempAccess);
          }
          if (tempId !== undefined) {
            configService.setSync("id_token", tempId);
          }

          // Update UI and notify DeepNest
          const cfgValues = configService.getSync() as unknown as ConfigResult;
          getDeepNest().config(cfgValues);
          updateForm(cfgValues);

          message("Preset loaded successfully!");
        } else {
          message("Selected preset not found", true);
        }
      } catch {
        message("Error loading preset", true);
      }
    });
  }

  // Delete preset button click
  if (deletePresetBtn) {
    deletePresetBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      const selectedPreset = presetSelect?.value || "";
      if (!selectedPreset) {
        message("Please select a preset to delete");
        return;
      }

      if (
        confirm(
          `Are you sure you want to delete the preset "${selectedPreset}"?`,
        )
      ) {
        try {
          await presetService.deletePreset(selectedPreset);
          await loadPresetList();
          if (presetSelect) {
            presetSelect.selectedIndex = 0;
          }
          message("Preset deleted successfully!");
        } catch {
          message("Error deleting preset", true);
        }
      }
    });
  }
}

/**
 * Initialize config form change handlers
 */
function initializeConfigForm(): void {
  const inputs = document.querySelectorAll("#config input, #config select");

  inputs.forEach((i) => {
    const inputElement = i as HTMLInputElement | HTMLSelectElement;
    const inputId = inputElement.getAttribute("id");

    // Skip preset-related inputs
    if (inputId && ["presetSelect", "presetName"].includes(inputId)) {
      return;
    }

    inputElement.addEventListener("change", () => {
      let val: string | number | boolean = inputElement.value;
      const key = inputElement.getAttribute("data-config") as
        | keyof UIConfig
        | null;

      if (!key) {
        return;
      }

      // Handle scale conversion
      if (key === "scale") {
        if (configService.getSync("units") === "mm") {
          val = Number(val) * 25.4; // Store scale config in inches
        }
      }

      // Handle boolean inputs (checkboxes)
      if (BOOLEAN_CONFIG_KEYS.includes(key)) {
        val = (inputElement as HTMLInputElement).checked;
      }

      // Handle unit conversion
      if (inputElement.getAttribute("data-conversion") === "true") {
        let conversion = configService.getSync("scale");
        if (configService.getSync("units") === "mm") {
          conversion /= 25.4;
        }
        val = Number(val) * conversion;
      }

      // Show spinner during save
      if (inputElement.parentNode) {
        (inputElement.parentNode as HTMLElement).className = "progress";
      }

      // Update config
      configService.setSync(key, val as UIConfig[typeof key]);
      const cfgValues = configService.getSync() as unknown as ConfigResult;
      getDeepNest().config(cfgValues);
      updateForm(cfgValues);

      // Remove spinner
      if (inputElement.parentNode) {
        (inputElement.parentNode as HTMLElement).className = "";
      }

      // Update unit-related Ractive bindings
      if (key === "units" && partsViewService) {
        partsViewService.updateUnits();
      }
    });

    // Config explanation hover handlers
    inputElement.onmouseover = () => {
      const configKey = inputElement.getAttribute("data-config");
      if (configKey) {
        document.querySelectorAll(".config_explain").forEach((el) => {
          el.className = "config_explain";
        });

        const selected = document.querySelector("#explain_" + configKey);
        if (selected) {
          selected.className = "config_explain active";
        }
      }
    };

    inputElement.onmouseleave = () => {
      document.querySelectorAll(".config_explain").forEach((el) => {
        el.className = "config_explain";
      });
    };
  });

  // Reset to defaults button
  const setDefaultBtn = getElement<HTMLElement>("#setdefault");
  if (setDefaultBtn) {
    setDefaultBtn.onclick = (e) => {
      e.preventDefault();

      // Preserve user profile
      const tempAccess = configService.getSync("access_token") as
        | string
        | undefined;
      const tempId = configService.getSync("id_token") as string | undefined;

      configService.resetToDefaultsSync();

      // Restore user profile
      if (tempAccess !== undefined) {
        configService.setSync("access_token", tempAccess);
      }
      if (tempId !== undefined) {
        configService.setSync("id_token", tempId);
      }

      const cfgValues = configService.getSync() as unknown as ConfigResult;
      getDeepNest().config(cfgValues);
      updateForm(cfgValues);

      return false;
    };
  }

  // Add spinner elements to each form dd
  const ddElements = document.querySelectorAll("#configform dd");
  ddElements.forEach((d) => {
    const spinner = document.createElement("div");
    spinner.className = "spinner";
    d.appendChild(spinner);
  });
}

/**
 * Initialize background progress handler
 */
function initializeBackgroundProgress(): void {
  ipcRenderer.on(
    IPC_CHANNELS.BACKGROUND_PROGRESS,
    (_event: unknown, ...args: unknown[]) => {
      const p = args[0] as NestingProgress;
      const bar = getElement<HTMLElement>("#progressbar");
      if (bar) {
        const progress = p.progress;
        const style = `width: ${parseInt(String(progress * 100))}%${progress < 0.01 ? "; transition: none" : ""}`;
        bar.setAttribute("style", style);
      }
    },
  );
}

/**
 * Initialize drag/drop prevention
 */
function initializeDragDropPrevention(): void {
  document.ondragover = document.ondrop = (ev) => {
    ev.preventDefault();
  };

  document.body.ondrop = (ev) => {
    ev.preventDefault();
  };
}

/**
 * Initialize message close handler
 */
function initializeMessageClose(): void {
  const messageClose = getElement<HTMLAnchorElement>("#message a.close");
  if (messageClose) {
    messageClose.onclick = () => {
      const wrapper = getElement<HTMLElement>("#messagewrapper");
      if (wrapper) {
        wrapper.className = "";
      }
      return false;
    };
  }
}

/**
 * Initialize parts list resize functionality
 */
function initializePartsResize(): void {
  interact(".parts-drag")
    .resizable({
      preserveAspectRatio: false,
      edges: { left: false, right: true, bottom: false, top: false },
    })
    .on("resizemove", resize);

  window.addEventListener("resize", () => {
    resize();
  });

  // Initial resize
  resize();
}

/**
 * Initialize version info display
 */
function initializeVersionInfo(): void {
  try {
    const pjson = require("../package.json") as { version: string };
    const versionElement = getElement<HTMLElement>("#package-version");
    if (versionElement) {
      versionElement.innerText = pjson.version;
    }
  } catch {
    // Ignore if package.json is not accessible
  }
}

/**
 * Initialize all services
 */
async function initializeServices(): Promise<void> {
  // Create config service and set up window.config
  configService = await createConfigService(ipcRenderer);
  (
    window as unknown as {
      config: unknown;
      nest: unknown;
      loginWindow: unknown;
    }
  ).config = configService as unknown as ConfigObject;

  // Create preset service
  presetService = createPresetService(ipcRenderer);

  // Get config values and configure DeepNest
  const cfgValues = configService.getSync() as unknown as ConfigResult;
  getDeepNest().config(cfgValues);
  updateForm(cfgValues);
}

/**
 * Initialize all components
 */
function initializeComponents(): void {
  // Initialize navigation with dark mode
  navigationService = createNavigationService({ resizeCallback: resize });
  navigationService.initialize();

  // Initialize parts view
  partsViewService = createPartsViewService({
    deepNest: getDeepNest(),
    config: configService as unknown as ConfigObject,
    resizeCallback: resize,
  });
  partsViewService.initialize();

  // Initialize nest view
  nestViewService = createNestViewService({
    deepNest: getDeepNest(),
    config: configService as unknown as ConfigObject,
  });
  nestViewService.initialize();

  // Set window.nest reference for backward compatibility
  (
    window as unknown as {
      config: unknown;
      nest: unknown;
      loginWindow: unknown;
    }
  ).nest = nestViewService.getRactive();

  // Initialize sheet dialog
  sheetDialogService = createSheetDialogService({
    deepNest: getDeepNest(),
    config: configService as unknown as ConfigObject,
    // Use updatePartsCallback instead of ractive to avoid type conflicts
    updatePartsCallback: () => partsViewService.update(),
    resizeCallback: resize,
  });
  sheetDialogService.initialize();

  // Initialize import service
  importService = createImportService({
    dialog: electronRemote.dialog as unknown as {
      showOpenDialog: (
        options: unknown,
      ) => Promise<{ canceled: boolean; filePaths: string[] }>;
    },
    remote: electronRemote as unknown as {
      getGlobal: (name: string) => string | undefined;
    },
    fs: fs as unknown as {
      readFileSync: (path: string) => Buffer;
      readFile: (
        path: string,
        encoding: string,
        callback: (err: Error | null, data: string) => void,
      ) => void;
      readdirSync: (path: string) => string[];
    },
    path: path,
    httpClient: axios.default as unknown as {
      post: (
        url: string,
        data: Buffer,
        options: { headers: Record<string, string>; responseType: string },
      ) => Promise<{ data: string }>;
    },
    FormData: FormData as unknown as new () => {
      append: (
        name: string,
        value: Buffer | string,
        options?: { filename?: string; contentType?: string },
      ) => void;
      getBuffer: () => Buffer;
      getHeaders: () => Record<string, string>;
    },
    svgPreProcessor: svgPreProcessor,
    config: configService as unknown as {
      getSync: <K extends keyof UIConfig>(
        key?: K,
      ) => K extends keyof UIConfig ? UIConfig[K] : UIConfig;
    },
    deepNest: getDeepNest(),
    ractive:
      partsViewService.getRactive() as unknown as RactiveInstance<PartsViewData>,
    attachSortCallback: () => partsViewService.attachSort(),
    applyZoomCallback: () => partsViewService.applyZoom(),
    resizeCallback: resize,
  });

  // Initialize export service
  exportService = createExportService({
    dialog: electronRemote.dialog as unknown as {
      showSaveDialogSync: (options: {
        title: string;
        filters: { name: string; extensions: string[] }[];
      }) => string | undefined;
    },
    remote: electronRemote as unknown as {
      getGlobal: (name: string) => string | undefined;
    },
    fs: fs as unknown as {
      writeFileSync: (path: string, data: string) => void;
    },
    httpClient: axios.default as unknown as {
      post: (
        url: string,
        data: Buffer,
        options: { headers: Record<string, string>; responseType: string },
      ) => Promise<{ data: string }>;
    },
    FormData: FormData as unknown as new () => {
      append: (
        name: string,
        value: Buffer | string,
        options?: { filename?: string; contentType?: string },
      ) => void;
      getBuffer: () => Buffer;
      getHeaders: () => Record<string, string>;
    },
    config: configService as unknown as {
      getSync: <K extends keyof UIConfig>(
        key?: K,
      ) => K extends keyof UIConfig ? UIConfig[K] : UIConfig;
    },
    deepNest: getDeepNest(),
    svgParser: getSvgParser(),
    // Note: exportButton set separately after initialization via setExportButton
  });

  // Set export button after creation - HTMLElement already has className
  const exportButton = getElement<HTMLElement>("#export");
  if (exportButton) {
    // Cast is safe: HTMLElement has className property which is what ExportButtonElement adds
    exportService.setExportButton(
      exportButton as HTMLElement & { className: string },
    );
  }

  // Initialize nesting service
  nestingService = createNestingService({
    fs: fs as unknown as {
      existsSync: (path: string) => boolean;
      readdirSync: (path: string) => string[];
      lstatSync: (path: string) => { isDirectory: () => boolean };
      unlinkSync: (path: string) => void;
      rmdirSync: (path: string) => void;
    },
    ipcRenderer: ipcRenderer as unknown as {
      send: (channel: string, ...args: unknown[]) => void;
    },
    deepNest: getDeepNest(),
    // Note: nestRactive set separately to avoid type conflicts
    displayNestFn: nestViewService.getDisplayNestCallback(),
    saveJsonFn: () => exportService.exportToJson(),
  });

  // Set nestRactive separately to avoid type conflicts
  const nestRactive = nestViewService.getRactive();
  if (nestRactive) {
    nestingService.setNestRactive(
      nestRactive as unknown as RactiveInstance<NestViewData>,
    );
  }

  nestingService.bindEventHandlers();
}

/**
 * Initialize import button handler
 */
function initializeImportButton(): void {
  const importButton = getElement<HTMLElement>("#import");
  if (importButton) {
    importButton.onclick = async () => {
      if (
        importButton.className.includes("disabled") ||
        importButton.className.includes("spinner")
      ) {
        return false;
      }

      importButton.className = "button import disabled";

      try {
        importButton.className = "button import spinner";
        await importService.showImportDialog();
      } finally {
        importButton.className = "button import";
      }

      return false;
    };
  }
}

/**
 * Initialize export button handlers
 */
function initializeExportButtons(): void {
  // JSON export
  const exportJsonBtn = getElement<HTMLElement>("#exportjson");
  if (exportJsonBtn) {
    exportJsonBtn.onclick = () => {
      exportService.exportToJson();
      return false;
    };
  }

  // SVG export
  const exportSvgBtn = getElement<HTMLElement>("#exportsvg");
  if (exportSvgBtn) {
    exportSvgBtn.onclick = () => {
      exportService.exportToSvg();
      return false;
    };
  }

  // DXF export
  const exportDxfBtn = getElement<HTMLElement>("#exportdxf");
  if (exportDxfBtn) {
    exportDxfBtn.onclick = async () => {
      await exportService.exportToDxf();
      return false;
    };
  }
}

/**
 * Initialize keyboard shortcuts
 */
function initializeKeyboardShortcuts(): void {
  window.addEventListener("keydown", (e) => {
    const target = e.target as HTMLElement;
    const isInput =
      target.tagName === "INPUT" ||
      target.tagName === "SELECT" ||
      target.tagName === "TEXTAREA";

    // Check view states
    const partsTools = getElement<HTMLElement>("#partstools");
    const isSheetDialogOpen =
      partsTools && partsTools.classList.contains("active");

    const nestView = getElement<HTMLElement>("#nest");
    const isNestViewActive = nestView && nestView.classList.contains("active");

    const exportDropdown = getElement<HTMLElement>(
      "#export_wrapper ul.dropdown",
    );
    // Check custom data attribute for open state since we manipulate styles
    const isExportDropdownOpen =
      exportDropdown && exportDropdown.dataset.isOpen === "true";

    const key = e.key.toLowerCase();

    // Sheet Dialog Shortcuts
    if (isSheetDialogOpen) {
      if (key === "enter") {
        getElement<HTMLElement>("#confirmsheet")?.click();
        e.preventDefault();
      } else if (key === "escape") {
        getElement<HTMLElement>("#cancelsheet")?.click();
        e.preventDefault();
      }
      return;
    }

    // Nest View Shortcuts
    if (isNestViewActive && !isInput) {
      if (key === "a" || key === "s") {
        // 'a' or 's': Stop/Start Nest (toggle)
        getElement<HTMLElement>("#stopnest")?.click();
        e.preventDefault();
      } else if (key === "b") {
        // 'b': Back
        getElement<HTMLElement>("#back")?.click();
        e.preventDefault();
      } else if (key === "e") {
        // 'e': Toggle Export Dropdown
        if (exportDropdown) {
          if (isExportDropdownOpen) {
            // Close
            exportDropdown.style.opacity = "";
            exportDropdown.style.height = "";
            delete exportDropdown.dataset.isOpen;
          } else {
            // Open
            exportDropdown.style.opacity = "1";
            exportDropdown.style.height = "5em"; // Match CSS height
            exportDropdown.dataset.isOpen = "true";
          }
        }
        e.preventDefault();
      } else if (key === "1" && isExportDropdownOpen) {
        // '1': Export SVG
        getElement<HTMLElement>("#exportsvg")?.click();
        // Close dropdown
        if (exportDropdown) {
          exportDropdown.style.opacity = "";
          exportDropdown.style.height = "";
          delete exportDropdown.dataset.isOpen;
        }
        e.preventDefault();
      } else if (key === "2" && isExportDropdownOpen) {
        // '2': Export DXF
        getElement<HTMLElement>("#exportdxf")?.click();
        if (exportDropdown) {
          exportDropdown.style.opacity = "";
          exportDropdown.style.height = "";
          delete exportDropdown.dataset.isOpen;
        }
        e.preventDefault();
      } else if (key === "3" && isExportDropdownOpen) {
        // '3': Export JSON
        getElement<HTMLElement>("#exportjson")?.click();
        if (exportDropdown) {
          exportDropdown.style.opacity = "";
          exportDropdown.style.height = "";
          delete exportDropdown.dataset.isOpen;
        }
        e.preventDefault();
      } else if (key === "escape" && isExportDropdownOpen) {
        // Esc: Close Dropdown
        if (exportDropdown) {
          exportDropdown.style.opacity = "";
          exportDropdown.style.height = "";
          delete exportDropdown.dataset.isOpen;
        }
        e.preventDefault();
      }
      return;
    }

    // Main View Shortcuts
    if (!isNestViewActive && !isInput) {
      if (key === "n") {
        // 'n': Add Sheet
        getElement<HTMLElement>("#addsheet")?.click();

        // Autofocus the width input immediately
        getElement<HTMLInputElement>("#sheetwidth")?.focus();

        e.preventDefault();
      } else if (key === "a") {
        // 'a': Select All (using ID selector)
        getElement<HTMLElement>("#selectall")?.click();
        e.preventDefault();
      } else if (key === "s") {
        // 's': Start Nest
        getElement<HTMLElement>("#startnest")?.click();
        e.preventDefault();
      } else if (key === "i") {
        // 'i': Import
        getElement<HTMLElement>("#import")?.click();
        e.preventDefault();
      } else if (key === "q") {
        // 'q': Focus first sheet quantity
        const rows = document.querySelectorAll("#partscroll table tbody tr");
        for (const row of Array.from(rows)) {
          const checkbox = row.querySelector(
            "td:nth-child(3) input[type=checkbox]",
          ) as HTMLInputElement;
          if (checkbox && checkbox.checked) {
            const qtyInput = row.querySelector(
              "td:nth-child(4) input[type=number]",
            ) as HTMLInputElement;
            if (qtyInput) {
              qtyInput.focus();
              qtyInput.select();
              e.preventDefault();
              break;
            }
          }
        }
      }
    }
  });
}

/**
 * Load initial SVG files from nest directory
 */
async function loadInitialFiles(): Promise<void> {
  await importService.loadNestDirectoryFiles();
}

/**
 * Main initialization function
 * Called when the DOM is ready
 */
async function initialize(): Promise<void> {
  // Load required Electron and Node.js modules
  const electron = require("electron") as { ipcRenderer: IpcRenderer };
  ipcRenderer = electron.ipcRenderer;
  electronRemote = require("@electron/remote") as typeof electronRemote;
  fs = require("graceful-fs");
  FormData = require("form-data") as typeof FormData;
  axios = require("axios") as typeof axios;
  path = require("path") as typeof path;
  svgPreProcessor =
    require("@deepnest/svg-preprocessor") as typeof svgPreProcessor;

  // Disable Ractive debug mode
  Ractive.DEBUG = false;

  // Initialize services first
  await initializeServices();

  // Initialize preset list
  await loadPresetList();

  // Initialize UI components
  initializeComponents();

  // Initialize UI handlers
  initializePresetModal();
  initializeConfigForm();
  initializeBackgroundProgress();
  initializeDragDropPrevention();
  initializeMessageClose();
  initializePartsResize();
  initializeVersionInfo();
  initializeImportButton();
  initializeExportButtons();
  initializeKeyboardShortcuts();

  // Load initial files from nest directory
  await loadInitialFiles();

  // Set up loginWindow reference
  (
    window as unknown as {
      config: unknown;
      nest: unknown;
      loginWindow: unknown;
    }
  ).loginWindow = null;
}

// Start initialization when DOM is ready
ready(initialize);

/**
 * Export service instances for external access if needed
 */
export {
  configService,
  presetService,
  importService,
  exportService,
  nestingService,
  navigationService,
  partsViewService,
  nestViewService,
  sheetDialogService,
};

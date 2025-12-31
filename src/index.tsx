import type { SelectOption } from "@opentui/core";
import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard } from "@opentui/react";
import { useState, useCallback, useEffect } from "react";
import { extractPack } from "@foundryvtt/foundryvtt-cli";
import { Glob } from "bun";
import path from "path";
import fs from "fs";

// Types
type FieldMappings = Record<string, Record<string, string>>;

type AppState = "input" | "processing" | "complete" | "error";
type FocusedField = "inputFolder" | "mappingFile" | "compendiumType" | "sortCheckbox" | "idKeyCheckbox";

const COLORS = {
  primary: "orange",        
  secondary: "white",      
  success: "green",        
  error: "red",          
  accent: "brightyellow",         
  muted: "gray"
}

// Utility functions
function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((current, key) => current?.[key], obj);
}

function getOutputFilename(inputPath: string): string {
  const normalizedPath = inputPath.replace(/\\/g, "/");
  const cleanPath = normalizedPath
    .replace(/\/output\/?$/, "")
    .replace(/\/$/, "");
  const parts = cleanPath.split("/").filter(Boolean);
  const relevantParts = parts.slice(-2);
  return `${relevantParts.join(".")}.json`;
}

function getPackName(inputPath: string): string {
  const normalizedPath = inputPath.replace(/\\/g, "/");
  const cleanPath = normalizedPath.replace(/\/$/, "");
  const parts = cleanPath.split("/").filter(Boolean);

  if (parts.length >= 2) {
    return parts[parts.length - 2] ?? "unknown";
  }
  return parts[parts.length - 1] ?? "unknown";
}

function parseTableResults(
  results: any[]
): Record<string, { name: string; description: string }> {
  const parsed: Record<string, { name: string; description: string }> = {};

  for (const result of results) {
    if (!result.range || result.range.length !== 2) continue;

    const [start, end] = result.range;
    const rangeKey = `${start}-${end}`;

    parsed[rangeKey] = {
      name: result.name || "",
      description: result.description || "",
    };
  }

  return parsed;
}

// Processing functions
async function extract(input: string) {
  const output = path.join(input, "output");

  if (fs.existsSync(output)) {
    fs.rmSync(output, { recursive: true });
  }

  await extractPack(input, output, { nedb: false });
}

async function compile(
  input: string,
  fieldMappings: FieldMappings,
  compendiumType: string,
  sortAlphabetically: boolean,
  useIdAsKey: boolean
) {
  const outputDir = path.join(input, "output");
  const glob = new Glob("**/*.json");

  const typeMapping = fieldMappings[compendiumType];
  if (!typeMapping) {
    throw new Error(`No mapping found for type: ${compendiumType}`);
  }

  const packName = getPackName(input);
  const label = `${packName} ${compendiumType}`;

  // Collect entries as array first for potential sorting
  const entriesArray: { key: string; name: string; data: Record<string, any> }[] = [];

  for await (const file of glob.scan(outputDir)) {
    const filePath = path.join(outputDir, file);
    const content = await Bun.file(filePath).json();

    const entryName = content.name as string;
    const entryId = content._id as string;
    const entryKey = useIdAsKey ? entryId : entryName;
    const entry: Record<string, any> = {};

    for (const [outputKey, sourcePath] of Object.entries(typeMapping)) {
      const value = getNestedValue(content, sourcePath as string);
      if (value !== undefined && value !== null && value !== "") {
        entry[outputKey] = value;
      }
    }

    if (Array.isArray(content.results)) {
      entry.results = parseTableResults(content.results);
    }

    entriesArray.push({ key: entryKey, name: entryName, data: entry });
  }

  // Sort alphabetically if enabled
  if (sortAlphabetically) {
    entriesArray.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Convert to object keyed by name or id
  const entries: Record<string, Record<string, any>> = {};
  for (const { key, data } of entriesArray) {
    entries[key] = data;
  }

  const outputFilename = getOutputFilename(input);
  const result = {
    label,
    mapping: typeMapping,
    entries,
  };

  if (!fs.existsSync("output")) {
    fs.mkdirSync("output", { recursive: true });
  }

  await Bun.write(`output/${outputFilename}`, JSON.stringify(result, null, 2));
  return { count: entriesArray.length, filename: outputFilename, label };
}

// Main App Component
function App() {
  const [state, setState] = useState<AppState>("input");
  const [focusedField, setFocusedField] = useState<FocusedField>("inputFolder");
  const [inputFolder, setInputFolder] = useState("");
  const [mappingFile, setMappingFile] = useState("mapping.json");
  const [typeOptions, setTypeOptions] = useState<SelectOption[]>([]);
  const [selectedTypeIndex, setSelectedTypeIndex] = useState(0);
  const [sortAlphabetically, setSortAlphabetically] = useState(false);
  const [useIdAsKey, setUseIdAsKey] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [resultInfo, setResultInfo] = useState<{
    count: number;
    filename: string;
    label: string;
  } | null>(null);

  // Load available types from mapping file
  useEffect(() => {
    async function loadTypes() {
      if (!fs.existsSync(mappingFile)) {
        setTypeOptions([]);
        return;
      }
      try {
        const fieldMappings: FieldMappings = await Bun.file(mappingFile).json();
        const options: SelectOption[] = Object.keys(fieldMappings).map((type) => ({
          name: type,
          description: `Extract ${type.toLowerCase()} pack`,
          value: type,
        }));
        setTypeOptions(options);
        setSelectedTypeIndex(0);
      } catch {
        setTypeOptions([]);
      }
    }
    loadTypes();
  }, [mappingFile]);

  useKeyboard((key) => {
    if (state === "input") {
      if (key.name === "tab") {
        setFocusedField((prev) => {
          if (prev === "inputFolder") return "mappingFile";
          if (prev === "mappingFile") return "compendiumType";
          if (prev === "compendiumType") return "sortCheckbox";
          if (prev === "sortCheckbox") return "idKeyCheckbox";
          return "inputFolder";
        });
      }
      if (key.name === "space" && focusedField === "sortCheckbox") {
        setSortAlphabetically((prev) => !prev);
      }
      if (key.name === "space" && focusedField === "idKeyCheckbox") {
        setUseIdAsKey((prev) => !prev);
      }
      if (key.name === "return" && (focusedField === "sortCheckbox" || focusedField === "idKeyCheckbox")) {
        handleProcess();
      }
      if (key.name === "escape") {
        process.exit(0);
      }
    }
    if (state === "complete" || state === "error") {
      if (key.name === "r") {
        setState("input");
        setResultInfo(null);
        setErrorMessage("");
        setStatusMessage("");
      }
      if (key.name === "escape" || key.name === "q") {
        process.exit(0);
      }
    }
  });

  const handleProcess = useCallback(async () => {
    if (!inputFolder.trim()) {
      setErrorMessage("Input folder is required");
      setState("error");
      return;
    }

    if (!fs.existsSync(inputFolder)) {
      setErrorMessage(`Input directory does not exist: ${inputFolder}`);
      setState("error");
      return;
    }

    if (!fs.existsSync(mappingFile)) {
      setErrorMessage(`Mapping file does not exist: ${mappingFile}`);
      setState("error");
      return;
    }

    if (typeOptions.length === 0) {
      setErrorMessage("No compendium types available in mapping file");
      setState("error");
      return;
    }

    const selectedType = typeOptions[selectedTypeIndex]?.value as string;
    if (!selectedType) {
      setErrorMessage("Please select a compendium type");
      setState("error");
      return;
    }

    setState("processing");
    setStatusMessage("Extracting compendium pack...");

    try {
      const fieldMappings: FieldMappings = await Bun.file(mappingFile).json();

      await extract(inputFolder);
      setStatusMessage("Compiling Babele translations...");

      const result = await compile(inputFolder, fieldMappings, selectedType, sortAlphabetically, useIdAsKey);

      setResultInfo(result);
      setStatusMessage("");
      setState("complete");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setState("error");
    }
  }, [inputFolder, mappingFile, typeOptions, selectedTypeIndex, sortAlphabetically, useIdAsKey]);

  return (
    <box flexDirection="column" padding={0} flexGrow={1}>
      {/* Header */}
      <box justifyContent="center" marginBottom={1}>
        <ascii-font font="tiny" color={COLORS.primary} text="BABELIZER" />
      </box>

      <box justifyContent="center" marginBottom={1}>
        <text fg={COLORS.secondary  }>
          Foundry VTT Babele Data Extractor
        </text>
      </box>

      {/* Input Form */}
      {state === "input" && (
        <box flexDirection="column" gap={1}>
  
          <box flexDirection="column">
            <text fg={COLORS.primary}>
              <strong>Compendium Pack</strong>{" "}
              <span fg={COLORS.muted}>(LevelDB)</span>
            </text>
            <box
              border
              borderStyle={focusedField === "inputFolder" ? "double" : "single"}
              borderColor={focusedField === "inputFolder" ? COLORS.primary : COLORS.muted}
              height={3}
            >
              <input
                placeholder="e.g., packs/my-module/actors"
                focused={focusedField === "inputFolder"}
                onInput={setInputFolder}
                onSubmit={handleProcess}
              />
            </box>
          </box>


          <box flexDirection="column">
            <text fg={COLORS.primary}>
              <strong>Mapping File</strong>{" "}
              <span fg={COLORS.muted}>(JSON)</span>
            </text>
            <box
              border
              borderStyle={focusedField === "mappingFile" ? "double" : "single"}
              borderColor={focusedField === "mappingFile" ? COLORS.primary : COLORS.muted}
              height={3}
            >
              <input
                placeholder="mapping.json"
                value="mapping.json"
                focused={focusedField === "mappingFile"}
                onInput={setMappingFile}
                onSubmit={handleProcess}
              />
            </box>
          </box>

          <box flexDirection="column">
            <text fg={COLORS.primary}>
              <strong>Compendium Type</strong>
            </text>
            <box
              border
              borderStyle={focusedField === "compendiumType" ? "double" : "single"}
              borderColor={focusedField === "compendiumType" ? COLORS.primary : COLORS.muted}
            >
              {typeOptions.length > 0 ? (
                <select
                  style={{height: 4}}
                  options={typeOptions}                  
                  focused={focusedField === "compendiumType"}
                  onChange={(index) => setSelectedTypeIndex(index)}
                />
              ) : (
                <text fg={COLORS.muted}>No types available - check mapping file</text>
              )}
            </box>
          </box>

          {/* Sort Checkbox */}
          <box flexDirection="row" gap={1} alignItems="center">
            <text fg={focusedField === "sortCheckbox" ? COLORS.primary : COLORS.muted}>
              {sortAlphabetically ? "[x]" : "[ ]"}
            </text>
            <text fg={focusedField === "sortCheckbox" ? COLORS.primary : COLORS.secondary}>
              Sort entries alphabetically
            </text>
          </box>

          {/* Use ID as Key Checkbox */}
          <box flexDirection="row" gap={1} alignItems="center">
            <text fg={focusedField === "idKeyCheckbox" ? COLORS.primary : COLORS.muted}>
              {useIdAsKey ? "[x]" : "[ ]"}
            </text>
            <text fg={focusedField === "idKeyCheckbox" ? COLORS.primary : COLORS.secondary}>
              Use ID as key instead of name
            </text>
          </box>

          {/* Instructions */}
          <box marginTop={1} flexDirection="column">
            <text fg={COLORS.muted}>
              <span fg={COLORS.accent}>Tab</span> Switch fields │{" "}
              <span fg={COLORS.accent}>Space</span> Toggle checkbox │{" "}
              <span fg={COLORS.accent}>Enter</span> Process │{" "}
              <span fg={COLORS.accent}>Esc</span> Exit
            </text>
          </box>
        </box>
      )}

      {/* Processing State */}
      {state === "processing" && (
        <box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
          <text fg={COLORS.error}>⏳ {statusMessage}</text>
        </box>
      )}

      {/* Complete State */}
      {state === "complete" && resultInfo && (
        <box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1} gap={1}>
          <text fg={COLORS.success}>
            <strong>✓ Extraction Complete!</strong>
          </text>
          <text>
            Label: <span fg={COLORS.accent}>{resultInfo.label}</span>
          </text>
          <text>
            Extracted <span fg={COLORS.primary}>{resultInfo.count}</span> entries
          </text>
          <text>
            Output: <span fg={COLORS.accent}>output/{resultInfo.filename}</span>
          </text>
          <box marginTop={1}>
            <text fg={COLORS.muted}>
              <span fg={COLORS.accent}>R</span> Process another │{" "}
              <span fg={COLORS.accent}>Q/Esc</span> Exit
            </text>
          </box>
        </box>
      )}

      {/* Error State */}
      {state === "error" && (
        <box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1} gap={1}>
          <text fg={COLORS.error}>
            <strong>✗ Error</strong>
          </text>
          <text fg={COLORS.error}>{errorMessage}</text>
          <box marginTop={1}>
            <text fg={COLORS.muted}>
              <span fg={COLORS.accent}>R</span> Try again │{" "}
              <span fg={COLORS.accent}>Q/Esc</span> Exit
            </text>
          </box>
        </box>
      )}
    </box>
  );
}

const renderer = await createCliRenderer();
createRoot(renderer).render(<App />);

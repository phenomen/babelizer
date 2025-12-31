# Babelizer

A CLI tool to extract Foundry VTT compendium packs into Babele translation files.

## Requirements

- [Bun](https://bun.sh/) runtime.

## Usage

```bash
bunx babelizer
```

## Mapping File

Create a `mapping.json` file to define which fields to extract for each compendium type. See example in `mapping.json`.

## Data Types

Currently the tool supports `Actors`, `Items`, `Scenes` and `Tables`. `Journals` support will be added soon.

Embedded items: while you can add `"items": "items"` mapping to export actor owned items, it's highly recommended to use`fromPack` Babele converter to translate embedded items.

## Credits

- [Foundry VTT CLI](https://github.com/foundryvtt/foundryvtt-cli) - tools to extract and compile pack data
- [OpenTUI](https://github.com/sst/opentui) - terminal UI library

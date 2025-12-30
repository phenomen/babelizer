# Babelizer

A CLI tool to extract Foundry VTT compendium packs into Babele translation files.

## Requirements

- [Bun](https://bun.sh/) runtime.

## Usage

```bash
bunx babelizer
```

## Mapping File

Create a `mapping.json` file to define which fields to extract for each compendium type. See example in `mapping.json.example`.

```json
{
  "Actors": {
    "name": "name",
    "description": "system.description"
  },
  "Items": {
    "name": "name",
    "description": "system.description"
  },
  "Scenes": {
    "name": "name"
  },
  "Tables": {
    "name": "name",
    "description": "description"
  }
}
```

## Data Types

Currently the tool supports `Actors`, `Items`, `Scenes` and `Tables`.
`Journals` support will be added soon.

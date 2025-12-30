# Babelizer

A CLI tool to extract Foundry VTT compendium packs into Babele translation files.

## Requirements

- [Bun](https://bun.sh/) runtime.

## Usage

```bash
bunx babelizer
```

## Mapping File

Create a `mapping.json` file to define which fields to extract for each compendium type:

```json
{
  "Actors": {
    "name": "name",
    "description": "system.details.description.value"
  },
  "Items": {
    "name": "name",
    "description": "system.description.value"
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

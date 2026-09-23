# @transferkit/cli

The local-first TransferKit CLI for structured engineering handover and onboarding workflows.

## Install

```bash
npm install --global @transferkit/cli
```

Node.js 24 or newer is required.

## Quick start

Run TransferKit from the repository being transferred:

```bash
tk handover init
tk handover scan
tk handover interview
tk handover audit
tk handover export

tk onboard plan
tk onboard status
```

TransferKit runs locally, does not upload source code, and keeps personal onboarding progress separate from shared handover state.

See the [TransferKit repository](https://github.com/alialaraby/transferkit) for complete documentation, supported detection, limitations, and contribution guidance.

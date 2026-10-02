# Event Count CLI

This small command-line tool reads a newline-delimited JSON event file and prints a count for each event type. It does not store or send events.

Run `npm start -- events.jsonl` with a local input file. A missing path prints usage and exits with a nonzero status; invalid JSON and events without a string `type` are also rejected. The command has not been run by TransferKit guide generation.

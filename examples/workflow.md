# Example ownership-transfer workflow

This example shows representative output for a NestJS service. Exact findings depend on the repository.

```console
$ tk handover init
Initialized TransferKit in /work/shipment-platform/.transferkit/project.yaml

$ tk handover scan
{
  "findings": [
    { "id": "framework.nestjs", "kind": "framework", "data": { "name": "NestJS" } },
    { "id": "messaging.rabbitmq", "kind": "messaging", "data": { "name": "RabbitMQ" } }
  ]
}

$ tk handover evidence
messaging.consumer: handleShipmentCreated
  src/shipment.consumer.ts:4 — RabbitSubscribe decorator marks this method as a RabbitMQ consumer

$ tk handover interview
3 critical questions remain.
Question 1 of 3
How critical is shipment-workers? 1) critical  2) important  3) non-critical
> 1

$ tk handover audit
Handover

shipment-workers
✓ Criticality
✓ Failure behavior
✓ Recovery / replay procedure
– Operational owner (skipped)
3 / 4 critical requirements complete

$ tk handover export
Generated /work/shipment-platform/.transferkit/handover

$ tk onboard plan
Onboarding Plan

Knowledge source: repository and human handover.
...

$ tk onboard task understand-system:consumer:shipments completed
Updated understand-system:consumer:shipments to completed.

$ tk onboard status
Understand the System   1/1
Trace It                0/1
```

The generated handover package is a view of `.transferkit` state. Personal task progress is stored separately in `.transferkit.local/`.

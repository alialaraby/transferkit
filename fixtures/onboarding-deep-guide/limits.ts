import { Controller, Post } from "@nestjs/common";

interface Dispatcher {
  send(value: string): void;
}

@Controller("limits")
export class LimitsController {
  private readonly handlers: Record<string, () => void> = {};

  constructor(private readonly dispatcher: Dispatcher) {}

  @Post("check")
  check(mode: string): void {
    if (mode === "stop") return;
    this.dispatcher.send(this.value());
    const callback = () => this.dispatcher.send("later");
    if (mode === "callback") callback();
    if (mode === "dynamic") this.handlers[mode]?.();
    for (let index = 0; index < 2; index++) this.dispatcher.send("loop");
    switch (mode) {
      case "dynamic":
        this.handlers[mode]?.();
        break;
    }
  }

  private value(): string {
    return "sample";
  }
}

class BaseRunner {
  run(): void {}
}

class DerivedRunner extends BaseRunner {}

@Controller("inherited")
export class InheritedController {
  constructor(private readonly runner: DerivedRunner) {}

  @Post("run")
  run(): void {
    this.runner.run();
  }
}

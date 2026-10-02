declare module "@nestjs/common" {
  export function Controller(path: string): ClassDecorator;
  export function Post(path: string): MethodDecorator;
}

declare module "@nestjs/bull" {
  export function Process(name: string): MethodDecorator;
}

function Cron() {
  return () => undefined;
}
export class Local {
  @Cron("* * * * *") run() {}
  call(url: string) {
    client.fetch(url);
  }
}

/**
 * Executes tool calls returned by agents.
 */
export declare class ToolExecutor {
    execute(toolName: string, args: Record<string, unknown>): Promise<string>;
    private execFilesystem;
    private execShell;
    private execHttp;
    private execCode;
    private execWebFetch;
    private execWebSearch;
    private execBrowserUse;
    private execPriceFeed;
    private execMemorySearch;
}
//# sourceMappingURL=executor.d.ts.map
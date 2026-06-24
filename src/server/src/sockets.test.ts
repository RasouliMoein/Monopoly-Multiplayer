import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Socket, Server, activeServers } from "./sockets";
import { WebSocket as WSWebSocket } from "ws";
import { TranslateCode } from "../../shared/utils/code";

class MockWebSocket {
    public callbacks: Record<string, (args: any) => void> = {};
    public readyState = 1; // WSWebSocket.OPEN
    public sent: string[] = [];
    public isClosed = false;

    public on(event: string, callback: (args: any) => void) {
        this.callbacks[event] = callback;
        return this;
    }

    public send(data: string) {
        this.sent.push(data);
    }

    public close() {
        this.isClosed = true;
        if (this.callbacks["close"]) {
            this.callbacks["close"]();
        }
    }

    public simulateMessage(event: string, args: any) {
        if (this.callbacks["message"]) {
            this.callbacks["message"](Buffer.from(JSON.stringify({ event, args })));
        }
    }

    public simulateError(err: Error) {
        if (this.callbacks["error"]) {
            this.callbacks["error"](err);
        }
    }
}

describe("Sockets and Server wrappers", () => {
    let mockWS: MockWebSocket;
    let consoleErrorSpy: any;

    beforeEach(() => {
        mockWS = new MockWebSocket();
        consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        activeServers.clear();
        jest.useRealTimers();
    });

    describe("Socket wrapper class", () => {
        it("should register callbacks and handle message parse", () => {
            const socket = new Socket(mockWS as unknown as WSWebSocket, "client-1");
            const testSpy = jest.fn();
            socket.on("test-event", testSpy);

            mockWS.simulateMessage("test-event", { foo: "bar" });
            expect(testSpy).toHaveBeenCalledWith({ foo: "bar" });
        });

        it("should handle JSON parse errors gracefully", () => {
            const socket = new Socket(mockWS as unknown as WSWebSocket, "client-1");
            if (mockWS.callbacks["message"]) {
                mockWS.callbacks["message"](Buffer.from("invalid json"));
            }
            expect(consoleErrorSpy).toHaveBeenCalledWith("Message parse error", expect.any(Error));
        });

        it("should handle error events", () => {
            const socket = new Socket(mockWS as unknown as WSWebSocket, "client-1");
            const testErr = new Error("Network issues");
            mockWS.simulateError(testErr);
            expect(consoleErrorSpy).toHaveBeenCalledWith("Connection error:", testErr);
        });

        it("should call disconnect handler when WS socket closes", () => {
            const socket = new Socket(mockWS as unknown as WSWebSocket, "client-1");
            const disconnectSpy = jest.fn();
            socket.on("disconnect", disconnectSpy);

            mockWS.close();
            expect(disconnectSpy).toHaveBeenCalled();
        });

        it("should emit serialized payload when socket is open", () => {
            const socket = new Socket(mockWS as unknown as WSWebSocket, "client-1");
            socket.emit("greet", { msg: "hi" });
            expect(mockWS.sent.length).toBe(1);
            expect(JSON.parse(mockWS.sent[0])).toEqual({ event: "greet", args: { msg: "hi" } });
        });

        it("should not emit when socket is not open", () => {
            const socket = new Socket(mockWS as unknown as WSWebSocket, "client-1");
            mockWS.readyState = 0; // CONNECTING
            socket.emit("greet", { msg: "hi" });
            expect(mockWS.sent.length).toBe(0);
        });

        it("should disconnect and close websocket socket", () => {
            const socket = new Socket(mockWS as unknown as WSWebSocket, "client-1");
            socket.disconnect();
            expect(mockWS.isClosed).toBe(true);
        });
    });

    describe("Server wrapper class", () => {
        it("should register in activeServers and trigger setup callbacks", async () => {
            jest.useFakeTimers();
            const idfSpy = jest.fn();
            const server = new Server(idfSpy);

            expect(server.code).toBeDefined();
            expect(server.code.length).toBe(6);
            expect(activeServers.has(TranslateCode(server.code))).toBe(true);

            jest.advanceTimersByTime(105);
            expect(idfSpy).toHaveBeenCalledWith(server);
        });

        it("should handle new connection socket wraps", () => {
            const onConnSpy = jest.fn();
            const server = new Server(undefined, onConnSpy);

            server.onConnection(mockWS as unknown as WSWebSocket, "socket-abc");

            expect(mockWS.sent.length).toBe(1);
            expect(JSON.parse(mockWS.sent[0])).toEqual({ event: "assign_id", args: "socket-abc" });
            expect(onConnSpy).toHaveBeenCalledWith(expect.any(Socket), server);
        });

        it("should destroy room and remove from active map on cleanup timeout", () => {
            jest.useFakeTimers();
            const server = new Server();
            const hashedCode = TranslateCode(server.code);

            expect(activeServers.has(hashedCode)).toBe(true);

            // advance 5 mins (300000ms)
            jest.advanceTimersByTime(305000);

            expect(activeServers.has(hashedCode)).toBe(false);
        });

        it("should reset cleanup timers correctly", () => {
            jest.useFakeTimers();
            const server = new Server();
            const hashedCode = TranslateCode(server.code);

            server.resetCleanupTimer(10000); // 10s
            jest.advanceTimersByTime(5000);
            expect(activeServers.has(hashedCode)).toBe(true);

            jest.advanceTimersByTime(6000); // reaches 11s total
            expect(activeServers.has(hashedCode)).toBe(false);
        });

        it("should expose RenderLogs and setter OnLogs", () => {
            const server = new Server();
            const logSpy = jest.fn();
            server.OnLogs = logSpy;

            server.logFunction("hello log");
            expect(logSpy).toHaveBeenCalledWith("hello log");

            const server2 = new Server();
            const renderSpy = jest.fn();
            server2.RenderLogs(renderSpy);

            server2.logFunction("render log");
            expect(renderSpy).toHaveBeenCalledWith([["render log"]]);
        });
    });
});

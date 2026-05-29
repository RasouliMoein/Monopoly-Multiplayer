export function io(uri: string, forceToken?: string): Promise<Socket> {
        return new Promise((resolve, reject) => {
                let token = forceToken;
                if (!token) {
                        token = sessionStorage.getItem("monopoly_token_" + uri) || undefined;
                        if (!token) {
                                token = crypto.randomUUID();
                                sessionStorage.setItem("monopoly_token_" + uri, token);
                        }
                }

                const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
                const ws = new WebSocket(`${protocol}//${window.location.host}/room/${uri}?token=${token}`);

                const checkOpen = setTimeout(() => {
                        if (ws.readyState !== WebSocket.OPEN) {
			}
		}, 5000);

		ws.onopen = () => {
			clearTimeout(checkOpen);
			const sock = new Socket(ws);
			resolve(sock);
		};
		ws.onerror = (_e) => {
reject("WebSocket error");
};
});
}

// class For websocket
export class Socket {
private client: WebSocket;
public events: Map<string, (args: any) => void>;
public id: string;
constructor(_socket: WebSocket) {
this.id = "";
this.client = _socket;
this.events = new Map();

this.client.onmessage = (event) => {
try {
const d = JSON.parse(event.data) as {
event: string;
args: any;
};
if (d.event === "assign_id") {
this.id = d.args;
}
const xhandler = this.events.get(d.event);
if (xhandler !== undefined) {
xhandler(d.args);
}
} catch {}
};

this.client.onerror = (error) => {
console.error("Data connection error:", error);
};
this.client.onclose = () => {
try {
const xhandler = this.events.get("disconnect");
if (xhandler !== undefined) {
xhandler("");
}
} catch {}
};
}
public on(event_name: string | "disconnect", handler: (args: any) => void) {
this.events.set(event_name, handler);
}
public emit(event_name: string, args?: any) {
if (this.client.readyState === WebSocket.OPEN) {
this.client.send(
JSON.stringify({ event: event_name, args: args ?? undefined })
);
}
}
public disconnect() {
this.emit("disconnect");
this.client.close();
}
}

// Kept for offline/bot modes to avoid breaking everything
export class Server {
	public logFunction: (...data: any[]) => void = () => {};
	public renderFunction: (v: Array<any[]>) => void = () => {};
	public logs: Array<any[]> = [];
	public code: string = "";
	constructor(
		_idf?: (thisobj: Server) => void,
		_onf?: (s: Socket, server: Server) => void
	) {
	}
	public set OnLogs(_v: (...data: any[]) => void) {
	}
	public RenderLogs(_f: (v: Array<any[]>) => void) {
	}
	public stop() {
	}
}

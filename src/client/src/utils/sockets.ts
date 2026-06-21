import { logger } from "./logger";

export function io(uri: string, forceToken?: string): Promise<Socket> {
	return new Promise((resolve, reject) => {
		let token = forceToken;
		if (!token) {
			token = sessionStorage.getItem("monopoly_token_" + uri) || undefined;
			if (!token) {
				token = Date.now().toString(36) + Math.random().toString(36).substring(2);
				sessionStorage.setItem("monopoly_token_" + uri, token);
			}
		}

		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const ws = new WebSocket(`${protocol}//${window.location.host}/room/${uri}?token=${token}`);

		const checkOpen = setTimeout(() => {
			if (ws.readyState !== WebSocket.OPEN) {
				reject("Connection timeout");
			}
		}, 5000);

		// Register onclose BEFORE onopen so a pre-open close (e.g. 1008 Room not found)
		// is always caught and the promise is properly rejected.
		ws.onclose = (event) => {
			clearTimeout(checkOpen);
			if (event.code === 1008) {
				reject("Room not found");
			} else {
				reject(`Connection closed before open (code ${event.code})`);
			}
		};

		ws.onopen = () => {
			clearTimeout(checkOpen);
			// Hand off close-event handling to the Socket class.
			ws.onclose = null;
			const sock = new Socket(ws, uri, token!);
			resolve(sock);
		};

		ws.onerror = () => {
			clearTimeout(checkOpen);
			reject("WebSocket error");
		};
	});
}

// class For websocket
export class Socket {
private client: WebSocket;
public events: Map<string, (args: any) => void>;
public id: string;
private uri: string;
private token: string;
private reconnectAttempts: number = 0;
private maxReconnectAttempts: number = 5;
private isDisconnectingExplicitly: boolean = false;

constructor(_socket: WebSocket, uri: string, token: string) {
this.id = "";
this.client = _socket;
this.uri = uri;
this.token = token;
this.events = new Map();
this.setupSocketHandlers();
}

private setupSocketHandlers() {
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
if (this.isDisconnectingExplicitly) {
try {
const xhandler = this.events.get("disconnect");
if (xhandler !== undefined) xhandler("");
} catch {}
return;
}

if (this.reconnectAttempts < this.maxReconnectAttempts) {
this.reconnectAttempts += 1;
logger.warn(`Connection lost. Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);
try {
const reconHandler = this.events.get("reconnecting");
if (reconHandler !== undefined) reconHandler(this.reconnectAttempts);
} catch {}

setTimeout(() => {
this.reconnect();
}, 2000);
} else {
try {
const xhandler = this.events.get("disconnect");
if (xhandler !== undefined) xhandler("");
} catch {}
}
};
}

private reconnect() {
const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const newWs = new WebSocket(`${protocol}//${window.location.host}/room/${this.uri}?token=${this.token}`);

// Register onclose BEFORE onopen so a failed reconnect attempt (backend still down)
// is properly detected and the retry loop continues rather than stalling.
newWs.onclose = () => {
	if (this.reconnectAttempts < this.maxReconnectAttempts) {
		this.reconnectAttempts += 1;
		logger.warn(`Reconnect failed. Retrying ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);
		try {
			const reconHandler = this.events.get("reconnecting");
			if (reconHandler !== undefined) reconHandler(this.reconnectAttempts);
		} catch {}
		setTimeout(() => this.reconnect(), 2000);
	} else {
		try {
			const xhandler = this.events.get("disconnect");
			if (xhandler !== undefined) xhandler("");
		} catch {}
	}
};

newWs.onopen = () => {
	logger.info("Reconnected successfully!");
	// Clear the pre-open close handler; Socket class takes over from here.
	newWs.onclose = null;
	this.client = newWs;
	this.reconnectAttempts = 0;
	this.setupSocketHandlers();
	// Use localStorage so the name survives tab closes and lobby leaves.
	const name = localStorage.getItem("current_name") || sessionStorage.getItem("current_name") || "";
	if (name) {
		const isSpectator = sessionStorage.getItem("is_spectator_" + this.uri) === "true";
		if (isSpectator) {
			this.emit("spectator", name);
		} else {
			this.emit("name", name);
		}
	}
	try {
		const reconHandler = this.events.get("reconnected");
		if (reconHandler !== undefined) reconHandler("");
	} catch {}
};

newWs.onerror = () => {
	// onerror is always followed by onclose, which handles the retry.
	newWs.close();
};
}

public on(event_name: string | "disconnect" | "reconnecting" | "reconnected", handler: (args: any) => void) {
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
this.isDisconnectingExplicitly = true;
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
	constructor() {
	}
	public set OnLogs(v: (...data: any[]) => void) {
		this.logFunction = v;
	}
	public RenderLogs(f: (v: Array<any[]>) => void) {
		this.renderFunction = f;
	}
	public stop() {
	}
}

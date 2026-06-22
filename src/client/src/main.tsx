import ReactDOM from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import Home from "./Pages/Home/Home.tsx";

if (typeof window !== "undefined") {
    (window as any).VITE_LOG_LEVEL = import.meta.env.VITE_LOG_LEVEL;
    (window as any).VITE_CODE_PREFIX = import.meta.env.VITE_CODE_PREFIX;
}

const router = createBrowserRouter([
    {
        path: "/",
        element: <Home />,
    },
    {
        path: "/Monopoly",
        element: <Home />,
    },
]);

function App() {
    return <RouterProvider router={router} />;
}

document.title = "Monopoly";
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);

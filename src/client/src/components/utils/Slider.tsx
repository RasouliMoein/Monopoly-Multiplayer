import { useState } from "react";
import "./Slider.css";

interface SliderProps {
    /** Callback function fired when slider value updates */
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    /** Text suffix to display after value (e.g. "%" or "s") */
    suffix?: string;
    /** The granularity step value */
    step?: number;
    /** The maximum value of the range */
    max?: number;
    /** The minimum value of the range */
    min?: number;
    /** Default initialization value */
    defaultValue?: number;
    /** Decimal precision points to round value to */
    fixedNum?: number;
}

/**
 * A standard custom range slider component with numeric indicator and customization options.
 */
export default function Slider(prop: SliderProps) {
    const [v, SetV] = useState<number>(prop.defaultValue ?? 0);
    return (
        <div className="slider-component">
            <input
                type="range"
                onChange={(e) => {
                    prop.onChange?.(e);
                    SetV(parseFloat(e.currentTarget.value));
                }}
                defaultValue={prop.defaultValue ?? 50}
                step={prop.step ?? 1}
                max={prop.max ?? 100}
                min={prop.min ?? 0}
            />
            {v.toFixed(prop.fixedNum ?? 0)}
            {prop.suffix}
        </div>
    );
}

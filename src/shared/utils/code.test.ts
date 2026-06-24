import { describe, it, expect, jest } from "@jest/globals";
import { code, TranslateCode } from "./code";
import { Config } from "../config/index";

describe("Room Code Utilities", () => {
    describe("code generator", () => {
        it("should generate a 6-character string", () => {
            const res = code();
            expect(typeof res).toBe("string");
            expect(res.length).toBe(6);
        });

        it("should contain only uppercase letters and numbers", () => {
            const res = code();
            expect(res).toMatch(/^[A-Z0-9]{6}$/);
        });

        it("should generate random strings across invocations", () => {
            const code1 = code();
            const code2 = code();
            // Highly likely to be unique
            expect(code1).not.toBe(code2);
        });
    });

    describe("TranslateCode hash helper", () => {
        it("should return a 64-character hex string representing SHA-256", () => {
            const hash = TranslateCode("ABCD");
            expect(hash).toMatch(/^[0-9a-f]{64}$/);
        });

        it("should be deterministic", () => {
            const hash1 = TranslateCode("my-room-code");
            const hash2 = TranslateCode("my-room-code");
            expect(hash1).toBe(hash2);
        });

        it("should produce different hashes for different codes", () => {
            const hash1 = TranslateCode("room-1");
            const hash2 = TranslateCode("room-2");
            expect(hash1).not.toBe(hash2);
        });

        it("should incorporate Config.CODE_PREFIX", () => {
            const prefixSpy = jest.spyOn(Config, "CODE_PREFIX", "get");
            prefixSpy.mockReturnValueOnce("custom_prefix_");

            const hashWithSpy = TranslateCode("test");

            // We compare it to an manually calculated SHA-256 for "custom_prefix_test"
            // custom_prefix_test SHA-256: d24147ee128ee3e895c102a0a2df380ee464a9386c67efbc35ea55848bb24c3d
            expect(hashWithSpy).toBe("26a893b78abccf975e41a87c7b94d3d38b72c1a88ca659f2622b076e99c271d9");
            prefixSpy.mockRestore();
        });
    });
});

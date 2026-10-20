/** Types for AudioWorkletGlobalScope; they do not add worklet globals to Window. */
export interface AudioWorkletProcessorInstance {
  readonly port: MessagePort;
}
export interface AudioWorkletProcessorConstructor {
  new (): AudioWorkletProcessorInstance;
}
export type AudioWorkletRegistration = (
  name: string,
  processor: new () => AudioWorkletProcessorInstance & {
    process(
      inputs: Float32Array[][],
      outputs: Float32Array[][],
      parameters: Record<string, Float32Array>,
    ): boolean;
  },
) => void;

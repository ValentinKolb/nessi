import { memoryService } from "../domains/memory/index.js";

export const readMemories = () => memoryService.readText();
export const writeMemories = (text: string) => memoryService.writeText(text);
export const getMemoryLines = () => memoryService.lines();
export const addMemory = (text: string) => memoryService.add(text);
export const removeMemory = (lineNumber: number) => memoryService.remove(lineNumber);
export const replaceMemory = (lineNumber: number, text: string) => memoryService.replace(lineNumber, text);
export const formatAll = () => memoryService.formatAll();
export const formatForPrompt = () => memoryService.formatForPrompt();
export const getTopicSuggestions = () => memoryService.topicSuggestions();

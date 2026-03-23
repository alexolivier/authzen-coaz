import type { RegisteredTool } from "../coaz/types.js";
import { getCustomer } from "./get-customer.js";
import { transferCustomer } from "./transfer-customer.js";

export const tools: RegisteredTool[] = [getCustomer, transferCustomer];

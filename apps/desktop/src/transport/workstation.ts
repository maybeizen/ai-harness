import { invoke } from '@tauri-apps/api/core';
import {
  workstationOperationSchema,
  type WorkstationOperation,
} from '@harness/contracts';
export function workstation(operation: WorkstationOperation) {
  return invoke('workstation_operation', {
    operation: workstationOperationSchema.parse(operation),
  });
}

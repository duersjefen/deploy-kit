/**
 * Terminal UI - Main App Component
 *
 * Beautiful command palette built with Ink (React for terminal).
 * Features:
 * - Fuzzy command search
 * - Interactive parameter input
 * - Real-time execution monitoring
 * - Command history & favorites
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import Fuse from 'fuse.js';
import {
  commandRegistry,
  searchCommands,
  getCommandsByCategory,
  type CommandMetadata,
} from '../registry/command-registry.js';
import { commandExecutor } from '../registry/command-executor.js';
import { commandHistory } from '../registry/command-history.js';
import { CommandPalette } from './components/CommandPalette.js';
import { CommandDetail } from './components/CommandDetail.js';
import { ParameterInput } from './components/ParameterInput.js';
import { ExecutionView } from './components/ExecutionView.js';
import { WorkflowView } from './components/WorkflowView.js';
import { Header } from './components/Header.js';
import { Footer } from './components/Footer.js';

// ============================================================================
// TYPES
// ============================================================================

type ViewMode =
  | 'search'       // Command search palette
  | 'detail'       // Command detail view
  | 'parameters'   // Parameter input
  | 'executing'    // Command execution
  | 'workflows';   // Workflow templates

export interface AppState {
  mode: ViewMode;
  searchQuery: string;
  selectedCommand: CommandMetadata | null;
  selectedWorkflowId: string | null;
  parameters: Record<string, any>;
  executionId: string | null;
  error: string | null;
}

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

export const App: React.FC = () => {
  const { exit } = useApp();

  const [state, setState] = useState<AppState>({
    mode: 'search',
    searchQuery: '',
    selectedCommand: null,
    selectedWorkflowId: null,
    parameters: {},
    executionId: null,
    error: null,
  });

  // Get smart suggestions
  const suggestions = commandHistory.getSmartSuggestions();
  const recentCommands = commandHistory.getRecentCommands();
  const favorites = commandHistory.getFavorites();
  const workflows = commandHistory.getWorkflows();

  // Handle keyboard input
  useInput((input, key) => {
    // Global shortcuts
    if (key.escape) {
      if (state.mode === 'search') {
        exit();
      } else if (state.mode === 'executing') {
        // Can't cancel during execution
        return;
      } else {
        // Go back to search
        setState(prev => ({
          ...prev,
          mode: 'search',
          selectedCommand: null,
          parameters: {},
          error: null,
        }));
      }
    }

    if (key.ctrl && input === 'c') {
      exit();
    }

    // Mode-specific shortcuts
    if (state.mode === 'search') {
      if (key.ctrl && input === 'w') {
        setState(prev => ({ ...prev, mode: 'workflows' }));
      }
    }
  });

  // Handle command selection
  const handleCommandSelect = (command: CommandMetadata) => {
    setState(prev => ({
      ...prev,
      mode: 'detail',
      selectedCommand: command,
      error: null,
    }));
  };

  // Handle workflow selection
  const handleWorkflowSelect = (workflowId: string) => {
    setState(prev => ({
      ...prev,
      mode: 'executing',
      selectedWorkflowId: workflowId,
      error: null,
    }));
  };

  // Handle proceed to parameters
  const handleProceedToParameters = () => {
    if (!state.selectedCommand) return;

    // If no parameters needed, execute directly
    if (state.selectedCommand.parameters.length === 0) {
      handleExecute({});
    } else {
      setState(prev => ({ ...prev, mode: 'parameters' }));
    }
  };

  // Handle execute command
  const handleExecute = async (parameters: Record<string, any>) => {
    if (!state.selectedCommand) return;

    setState(prev => ({
      ...prev,
      mode: 'executing',
      parameters,
      error: null,
    }));

    try {
      const result = await commandExecutor.execute(
        state.selectedCommand.name,
        parameters,
        {
          cwd: process.cwd(),
        }
      );

      // Add to history
      commandHistory.addToHistory(result);

      // If command is 'dev', keep the process running (dashboard)
      if (state.selectedCommand.name === 'dev') {
        // Dev command opens dashboard, so we exit the TUI
        exit();
      } else {
        // Show completion and return to search after 2 seconds
        setTimeout(() => {
          setState(prev => ({
            ...prev,
            mode: 'search',
            selectedCommand: null,
            parameters: {},
            executionId: null,
          }));
        }, 2000);
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        mode: 'search',
        selectedCommand: null,
        parameters: {},
        error: (error as Error).message,
      }));
    }
  };

  // Render current view
  const renderView = () => {
    switch (state.mode) {
      case 'search':
        return (
          <CommandPalette
            searchQuery={state.searchQuery}
            onSearchChange={(query) => setState(prev => ({ ...prev, searchQuery: query }))}
            onCommandSelect={handleCommandSelect}
            suggestions={suggestions}
            recentCommands={recentCommands}
            favorites={favorites}
          />
        );

      case 'detail':
        if (!state.selectedCommand) return null;
        return (
          <CommandDetail
            command={state.selectedCommand}
            onExecute={handleProceedToParameters}
            onBack={() => setState(prev => ({ ...prev, mode: 'search' }))}
          />
        );

      case 'parameters':
        if (!state.selectedCommand) return null;
        return (
          <ParameterInput
            command={state.selectedCommand}
            onSubmit={handleExecute}
            onBack={() => setState(prev => ({ ...prev, mode: 'detail' }))}
          />
        );

      case 'executing':
        if (!state.selectedCommand && !state.selectedWorkflowId) return null;
        return (
          <ExecutionView
            commandName={state.selectedCommand?.name}
            workflowId={state.selectedWorkflowId}
            parameters={state.parameters}
          />
        );

      case 'workflows':
        return (
          <WorkflowView
            workflows={workflows}
            onWorkflowSelect={handleWorkflowSelect}
            onBack={() => setState(prev => ({ ...prev, mode: 'search' }))}
          />
        );

      default:
        return null;
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Header mode={state.mode} />

      <Box flexDirection="column" marginTop={1}>
        {renderView()}
      </Box>

      {state.error && (
        <Box marginTop={1} borderStyle="round" borderColor="red" padding={1}>
          <Text color="red">❌ Error: {state.error}</Text>
        </Box>
      )}

      <Footer mode={state.mode} />
    </Box>
  );
};

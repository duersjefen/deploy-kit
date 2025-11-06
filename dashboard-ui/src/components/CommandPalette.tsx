/**
 * Command Palette Component (⌘K)
 *
 * Spotlight-style command palette for web dashboard.
 * Built with cmdk library (used by Vercel, Linear, etc.)
 */

import React, { useState, useEffect } from 'react';
import { Command } from 'cmdk';
import './CommandPalette.css';

// Import command registry (we'll need to expose it to browser)
interface CommandMetadata {
  name: string;
  description: string;
  category: string;
  icon: string;
  keywords: string[];
  dangerLevel: string;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: CommandMetadata[];
  onCommandSelect: (commandName: string) => void;
  recentCommands?: string[];
  favorites?: string[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onClose,
  commands,
  onCommandSelect,
  recentCommands = [],
  favorites = [],
}) => {
  const [search, setSearch] = useState('');

  // Handle keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onClose();
      }
    };

    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, onClose]);

  if (!open) return null;

  // Group commands by category
  const commandsByCategory = commands.reduce((acc, cmd) => {
    if (!acc[cmd.category]) {
      acc[cmd.category] = [];
    }
    acc[cmd.category].push(cmd);
    return acc;
  }, {} as Record<string, CommandMetadata[]>);

  const handleSelect = (commandName: string) => {
    onCommandSelect(commandName);
    onClose();
    setSearch('');
  };

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <Command.Dialog
        open={open}
        onOpenChange={onClose}
        className="command-palette"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="command-palette-header">
          <Command.Input
            value={search}
            onValueChange={setSearch}
            placeholder="Search commands..."
            className="command-palette-input"
            autoFocus
          />
        </div>

        <Command.List className="command-palette-list">
          <Command.Empty className="command-palette-empty">
            No commands found for "{search}"
          </Command.Empty>

          {/* Favorites */}
          {favorites.length > 0 && !search && (
            <Command.Group heading="⭐ Favorites" className="command-group">
              {favorites.map((name) => {
                const cmd = commands.find((c) => c.name === name);
                if (!cmd) return null;
                return (
                  <Command.Item
                    key={cmd.name}
                    value={cmd.name}
                    onSelect={() => handleSelect(cmd.name)}
                    className="command-item"
                  >
                    <span className="command-icon">{cmd.icon}</span>
                    <div className="command-info">
                      <div className="command-name">dk {cmd.name}</div>
                      <div className="command-description">{cmd.description}</div>
                    </div>
                    <div className={`command-danger danger-${cmd.dangerLevel}`}>
                      {cmd.dangerLevel}
                    </div>
                  </Command.Item>
                );
              })}
            </Command.Group>
          )}

          {/* Recent Commands */}
          {recentCommands.length > 0 && !search && (
            <Command.Group heading="🕐 Recent" className="command-group">
              {recentCommands.slice(0, 5).map((name) => {
                const cmd = commands.find((c) => c.name === name);
                if (!cmd) return null;
                return (
                  <Command.Item
                    key={`recent-${cmd.name}`}
                    value={cmd.name}
                    onSelect={() => handleSelect(cmd.name)}
                    className="command-item"
                  >
                    <span className="command-icon">{cmd.icon}</span>
                    <div className="command-info">
                      <div className="command-name">dk {cmd.name}</div>
                      <div className="command-description">{cmd.description}</div>
                    </div>
                  </Command.Item>
                );
              })}
            </Command.Group>
          )}

          {/* All Commands by Category */}
          {Object.entries(commandsByCategory).map(([category, cmds]) => (
            <Command.Group
              key={category}
              heading={category.charAt(0).toUpperCase() + category.slice(1)}
              className="command-group"
            >
              {cmds.map((cmd) => (
                <Command.Item
                  key={cmd.name}
                  value={`${cmd.name} ${cmd.keywords.join(' ')}`}
                  onSelect={() => handleSelect(cmd.name)}
                  className="command-item"
                >
                  <span className="command-icon">{cmd.icon}</span>
                  <div className="command-info">
                    <div className="command-name">dk {cmd.name}</div>
                    <div className="command-description">{cmd.description}</div>
                  </div>
                  <div className={`command-danger danger-${cmd.dangerLevel}`}>
                    {cmd.dangerLevel === 'high' && '⚠️'}
                    {cmd.dangerLevel === 'critical' && '🚨'}
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>

        <div className="command-palette-footer">
          <div className="command-palette-shortcuts">
            <span>
              <kbd>↑↓</kbd> Navigate
            </span>
            <span>
              <kbd>⏎</kbd> Select
            </span>
            <span>
              <kbd>⎋</kbd> Close
            </span>
          </div>
        </div>
      </Command.Dialog>
    </div>
  );
};

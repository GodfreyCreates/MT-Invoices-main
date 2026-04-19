import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export type PopoverSelectOption<T extends string = string> = {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
};

type PopoverSelectProps<T extends string = string> = {
  value: T | '';
  onValueChange: (value: T) => void;
  options: readonly PopoverSelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  emptyMessage?: string;
  ariaLabel?: string;
  triggerClassName?: string;
  contentClassName?: string;
  optionClassName?: string;
  align?: 'start' | 'end';
  sameWidth?: boolean;
};

type MenuState = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  direction: 'up' | 'down';
};

const VIEWPORT_PADDING = 12;
const POPOVER_GAP = 8;
const FALLBACK_MENU_WIDTH = 224;
const MIN_MENU_HEIGHT = 140;
const IDEAL_MENU_HEIGHT = 280;

function getNextEnabledIndex<T extends string>(
  options: readonly PopoverSelectOption<T>[],
  currentIndex: number,
  direction: 1 | -1,
) {
  if (options.length === 0) {
    return -1;
  }

  let nextIndex = currentIndex;

  for (let attempt = 0; attempt < options.length; attempt += 1) {
    nextIndex = (nextIndex + direction + options.length) % options.length;
    if (!options[nextIndex]?.disabled) {
      return nextIndex;
    }
  }

  return -1;
}

function getFirstEnabledIndex<T extends string>(options: readonly PopoverSelectOption<T>[]) {
  return options.findIndex((option) => !option.disabled);
}

function getLastEnabledIndex<T extends string>(options: readonly PopoverSelectOption<T>[]) {
  for (let index = options.length - 1; index >= 0; index -= 1) {
    if (!options[index]?.disabled) {
      return index;
    }
  }

  return -1;
}

export function PopoverSelect<T extends string = string>({
  value,
  onValueChange,
  options,
  placeholder = 'Select an option',
  disabled = false,
  emptyMessage = 'No options available',
  ariaLabel,
  triggerClassName,
  contentClassName,
  optionClassName,
  align = 'start',
  sameWidth = true,
}: PopoverSelectProps<T>) {
  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuState, setMenuState] = useState<MenuState | null>(null);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  const syncMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const width = sameWidth ? rect.width : Math.max(rect.width, FALLBACK_MENU_WIDTH);
    const availableBelow = window.innerHeight - rect.bottom - POPOVER_GAP - VIEWPORT_PADDING;
    const availableAbove = rect.top - POPOVER_GAP - VIEWPORT_PADDING;
    const shouldOpenUp = availableBelow < IDEAL_MENU_HEIGHT && availableAbove > availableBelow;
    const maxHeight = Math.max(
      MIN_MENU_HEIGHT,
      shouldOpenUp ? availableAbove : availableBelow,
    );
    const unclampedLeft = align === 'end' ? rect.right - width : rect.left;
    const left = Math.min(
      Math.max(VIEWPORT_PADDING, unclampedLeft),
      window.innerWidth - width - VIEWPORT_PADDING,
    );

    setMenuState({
      top: shouldOpenUp ? rect.top - POPOVER_GAP : rect.bottom + POPOVER_GAP,
      left,
      width,
      maxHeight,
      direction: shouldOpenUp ? 'up' : 'down',
    });
  }, [align, sameWidth]);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
  }, []);

  const openMenu = useCallback(
    (preferredIndex?: number) => {
      if (disabled) {
        return;
      }

      const fallbackIndex = getFirstEnabledIndex(options);
      const nextIndex =
        preferredIndex !== undefined && preferredIndex >= 0 && !options[preferredIndex]?.disabled
          ? preferredIndex
          : selectedOption
            ? options.findIndex((option) => option.value === selectedOption.value)
            : fallbackIndex;

      syncMenuPosition();
      setActiveIndex(nextIndex >= 0 ? nextIndex : fallbackIndex);
      setIsOpen(true);
    },
    [disabled, options, selectedOption, syncMenuPosition],
  );

  const selectOption = useCallback(
    (option: PopoverSelectOption<T>) => {
      if (option.disabled) {
        return;
      }

      onValueChange(option.value);
      setIsOpen(false);
      requestAnimationFrame(() => {
        triggerRef.current?.focus();
      });
    },
    [onValueChange],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    syncMenuPosition();

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      closeMenu();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
        triggerRef.current?.focus();
      }
    };

    window.addEventListener('resize', syncMenuPosition);
    window.addEventListener('scroll', syncMenuPosition, true);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('resize', syncMenuPosition);
      window.removeEventListener('scroll', syncMenuPosition, true);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [closeMenu, isOpen, syncMenuPosition]);

  useEffect(() => {
    if (!isOpen || activeIndex < 0) {
      return;
    }

    optionRefs.current[activeIndex]?.focus();
  }, [activeIndex, isOpen]);

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const selectedIndex = selectedOption
        ? options.findIndex((option) => option.value === selectedOption.value)
        : -1;
      openMenu(getNextEnabledIndex(options, selectedIndex, 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const selectedIndex = selectedOption
        ? options.findIndex((option) => option.value === selectedOption.value)
        : options.length;
      openMenu(getNextEnabledIndex(options, selectedIndex, -1));
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (isOpen) {
        closeMenu();
      } else {
        openMenu();
      }
    }
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
      closeMenu();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => getNextEnabledIndex(options, current, 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => getNextEnabledIndex(options, current, -1));
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(getFirstEnabledIndex(options));
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(getLastEnabledIndex(options));
      return;
    }

    if ((event.key === 'Enter' || event.key === ' ') && activeIndex >= 0) {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) {
        selectOption(option);
      }
    }
  };

  const menu =
    isOpen && menuState && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            role="listbox"
            id={listboxId}
            aria-label={ariaLabel ?? placeholder}
            tabIndex={-1}
            onKeyDown={handleMenuKeyDown}
            className={cn(
              'z-[140] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.3)]',
              contentClassName,
            )}
            style={{
              position: 'fixed',
              top: menuState.top,
              left: menuState.left,
              width: menuState.width,
              maxHeight: menuState.maxHeight,
              transform: menuState.direction === 'up' ? 'translateY(-100%)' : undefined,
            }}
          >
            <div className="max-h-[inherit] overflow-y-auto p-1.5">
              {options.length > 0 ? (
                options.map((option, index) => {
                  const isSelected = option.value === value;
                  const isActive = index === activeIndex;

                  return (
                    <button
                      key={option.value}
                      ref={(node) => {
                        optionRefs.current[index] = node;
                      }}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={option.disabled}
                      tabIndex={-1}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectOption(option)}
                      className={cn(
                        'flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition outline-none',
                        option.disabled
                          ? 'cursor-not-allowed opacity-50'
                          : isSelected
                            ? 'bg-indigo-50 text-indigo-700'
                            : isActive
                              ? 'bg-slate-100 text-slate-900'
                              : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
                        optionClassName,
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{option.label}</p>
                        {option.description ? (
                          <p className="mt-1 text-xs text-slate-500">
                            {option.description}
                          </p>
                        ) : null}
                      </div>
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                        {isSelected ? <Check className="h-4 w-4" /> : null}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-3 text-sm text-slate-500">{emptyMessage}</div>
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          if (isOpen) {
            closeMenu();
          } else {
            openMenu();
          }
        }}
        onKeyDown={handleTriggerKeyDown}
        className={cn(
          'flex h-12 w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-left text-sm text-slate-900 shadow-sm outline-none transition focus-visible:border-indigo-300 focus-visible:ring-2 focus-visible:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-60',
          triggerClassName,
        )}
      >
        <span className={cn('min-w-0 truncate', !selectedOption && 'text-slate-500')}>
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-slate-500 transition-transform', isOpen && 'rotate-180')}
        />
      </button>
      {menu}
    </>
  );
}

import { Drawer as DrawerPrimitive } from "vaul";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../../lib/utils";

export const Drawer = DrawerPrimitive.Root;
export const DrawerTrigger = DrawerPrimitive.Trigger;
export const DrawerClose = DrawerPrimitive.Close;

type DrawerContentProps = ComponentProps<typeof DrawerPrimitive.Content> & {
  children: ReactNode;
};

export function DrawerContent({ children, className, ...props }: DrawerContentProps) {
  return (
    <DrawerPrimitive.Portal>
      <DrawerPrimitive.Overlay className="drawer-overlay" />
      <DrawerPrimitive.Content className={cn("drawer-content", className)} {...props}>
        <div aria-hidden="true" className="drawer-handle" />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPrimitive.Portal>
  );
}

export function DrawerTitle({ className, ...props }: ComponentProps<typeof DrawerPrimitive.Title>) {
  return <DrawerPrimitive.Title className={cn("drawer-title", className)} {...props} />;
}

export function DrawerDescription({ className, ...props }: ComponentProps<typeof DrawerPrimitive.Description>) {
  return <DrawerPrimitive.Description className={cn("drawer-description", className)} {...props} />;
}

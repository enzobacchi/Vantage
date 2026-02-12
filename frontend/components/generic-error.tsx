"use client"

import { IconAlertTriangle } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"

interface GenericErrorProps {
  message?: string
  onRetry?: () => void
}

export function GenericError({ 
  message = "Something went wrong.", 
  onRetry 
}: GenericErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <IconAlertTriangle className="size-12 text-orange-500 mb-4" />
      <p className="text-muted-foreground text-center">{message}</p>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="mt-4 bg-transparent"
        >
          Try Again
        </Button>
      )}
    </div>
  )
}

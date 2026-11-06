"use client"

import React from "react"
import { instalarCapturaGlobal, reportarErroDoNavegador } from "../lib/telemetria"

interface ErrorBoundaryProps {
  children: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidMount() {
    instalarCapturaGlobal()
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo)
    // Antes o erro morria no console do cliente: ninguém ficava sabendo que
    // a tela tinha quebrado.
    reportarErroDoNavegador(error, errorInfo.componentStack ?? undefined)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh flex items-center justify-center bg-background p-4">
          <div className="bezel max-w-md w-full space-y-4 p-8">
            <h2 className="text-2xl font-semibold text-foreground">
              Esta tela não abriu
            </h2>
            <p className="text-sm text-muted-foreground">
              O erro foi registrado. Recarregue a página para continuar; suas reservas continuam salvas.
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false })
                window.location.reload()
              }}
              className="inline-flex items-center justify-center rounded-full bg-foreground text-background hover:bg-primary hover:text-primary-foreground h-10 px-5 text-sm font-medium transition-colors duration-300"
            >
              Recarregar página
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

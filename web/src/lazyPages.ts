import { lazy } from 'react'

/*
 * The app's top-level screens, each downloaded only when first shown. Before this the whole app was one
 * ~220 KB (gzipped) script, so a resident on 2G also downloaded the owner dashboard, and a website
 * visitor downloaded both. Render these inside AppRoutes' Suspense and LoadErrorBoundary.
 */
export const OwnerApp = lazy(() => import('./App.tsx'))
export const ResidentPortal = lazy(() => import('./ResidentPortal').then((module) => ({ default: module.ResidentPortal })))
export const PublicSite = lazy(() => import('./PublicSite').then((module) => ({ default: module.PublicSite })))
export const LoginPage = lazy(() => import('./LoginPage').then((module) => ({ default: module.LoginPage })))
export const BookingRequestPage = lazy(() => import('./BookingRequestPage').then((module) => ({ default: module.BookingRequestPage })))
export const RegistrationPage = lazy(() => import('./RegistrationPage').then((module) => ({ default: module.RegistrationPage })))

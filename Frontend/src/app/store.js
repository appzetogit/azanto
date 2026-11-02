import { configureStore } from '@reduxjs/toolkit'
import appReducer from './slices/appSlice'
import authReducer from './slices/authSlice'
import foodReducer from './slices/foodSlice'
import taxiReducer from './slices/taxiSlice'

export const store = configureStore({
  reducer: {
    app: appReducer,
    auth: authReducer,
    food: foodReducer,
    taxi: taxiReducer,
  },
})

export const getStoreState = () => store.getState()

export { useAuthStore } from '../core/auth/auth.store'

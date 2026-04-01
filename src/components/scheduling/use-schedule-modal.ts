'use client'

import { useState, useCallback } from 'react'

export function useScheduleModal() {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')

  const openModal = useCallback(() => {
    setSelectedDate('')
    setSelectedTime('')
    setIsOpen(true)
  }, [])

  const closeModal = useCallback(() => {
    setIsOpen(false)
  }, [])

  return {
    isOpen,
    openModal,
    closeModal,
    selectedDate,
    setSelectedDate,
    selectedTime,
    setSelectedTime,
  }
}

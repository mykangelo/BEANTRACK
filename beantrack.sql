-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Oct 01, 2026 at 09:47 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `beantrack`
--

-- --------------------------------------------------------

--
-- Table structure for table `batches`
--

CREATE TABLE `batches` (
  `id` int(11) NOT NULL,
  `batch_code` varchar(10) NOT NULL,
  `date_time` datetime DEFAULT current_timestamp(),
  `bean_type` varchar(20) NOT NULL,
  `mode` varchar(20) NOT NULL,
  `vibration_speed` int(11) NOT NULL,
  `input_weight` int(11) NOT NULL,
  `large_weight` int(11) DEFAULT 0,
  `medium_weight` int(11) DEFAULT 0,
  `small_weight` int(11) DEFAULT 0,
  `fine_weight` int(11) DEFAULT 0,
  `processing_time` int(11) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `accuracy_checks`
--

CREATE TABLE `accuracy_checks` (
  `id` int(11) NOT NULL,
  `batch_code` varchar(10) NOT NULL,
  `bin_name` varchar(20) NOT NULL,
  `beans_checked` decimal(10,2) NOT NULL DEFAULT 0.00,
  `correctly_sorted` decimal(10,2) NOT NULL DEFAULT 0.00,
  `created_at` datetime DEFAULT current_timestamp(),
  UNIQUE KEY `batch_bin` (`batch_code`,`bin_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `batches`
--

INSERT INTO `batches` (`id`, `batch_code`, `date_time`, `bean_type`, `mode`, `vibration_speed`, `input_weight`, `large_weight`, `medium_weight`, `small_weight`, `fine_weight`, `processing_time`) VALUES
(3, 'B005', '2026-10-01 15:25:44', 'Arabica', 'Automatic', 60, 1000, 340, 389, 149, 98, 59);

-- --------------------------------------------------------

--
-- Table structure for table `inventory`
--

CREATE TABLE `inventory` (
  `id` int(11) NOT NULL,
  `bean_type` varchar(20) NOT NULL,
  `category` varchar(20) NOT NULL,
  `quantity_kg` decimal(10,2) DEFAULT 0.00,
  `updated_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `inventory`
--

INSERT INTO `inventory` (`id`, `bean_type`, `category`, `quantity_kg`, `updated_at`) VALUES
(1, 'Arabica', 'large', 5.54, '2026-10-01 14:56:27'),
(2, 'Arabica', 'medium', 7.79, '2026-10-01 14:56:27'),
(3, 'Arabica', 'small', 2.25, '2026-10-01 14:56:27'),
(4, 'Arabica', 'fine', 0.90, '2026-10-01 14:56:27'),
(5, 'Robusta', 'large', 3.50, '2026-10-01 14:56:27'),
(6, 'Robusta', 'medium', 4.80, '2026-10-01 14:56:27'),
(7, 'Robusta', 'small', 1.20, '2026-10-01 14:56:27'),
(8, 'Robusta', 'fine', 0.40, '2026-10-01 14:56:27');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `batches`
--
ALTER TABLE `batches`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `batch_code` (`batch_code`);

--
-- Indexes for table `accuracy_checks`
--
ALTER TABLE `accuracy_checks`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `inventory`
--
ALTER TABLE `inventory`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `bean_category` (`bean_type`,`category`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `batches`
--
ALTER TABLE `batches`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `accuracy_checks`
--
ALTER TABLE `accuracy_checks`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `inventory`
--
ALTER TABLE `inventory`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;

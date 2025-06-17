<?php
// Directory where transcripts will be stored
$uploadDir = __DIR__ . '/transcripts/';
if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

// Grab channel ID and ensure file was uploaded
$channelId = $_POST['channel_id'] ?? null;
if (!$channelId || !isset($_FILES['file'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing channel_id or file.']);
    exit;
}

// Sanitize and generate filename
$extension = pathinfo($_FILES['file']['name'], PATHINFO_EXTENSION);
$random = bin2hex(random_bytes(5));
$filename = $channelId . '-' . $random . '.' . $extension;
$target = $uploadDir . $filename;

// Move file and return URL
if (move_uploaded_file($_FILES['file']['tmp_name'], $target)) {
    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? "https" : "http";
    $baseURL = $protocol . "://" . $_SERVER['HTTP_HOST'] . dirname($_SERVER['PHP_SELF']);
    $url = rtrim($baseURL, '/') . '/transcripts/' . $filename;

    echo json_encode(['success' => true, 'url' => $url]);
} else {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to move uploaded file.']);
}
?>

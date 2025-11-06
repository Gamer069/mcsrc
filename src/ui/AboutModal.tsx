import { Button, Modal } from "antd";
import { useState } from "react";
import { seenAbout } from "../logic/Settings";
import { InfoCircleOutlined } from '@ant-design/icons';

const AboutModal = () => {
    const [isModalOpen, setIsModalOpen] = useState(!seenAbout.value);

    const showModal = () => {
        setIsModalOpen(true);
    };

    const handleCancel = () => {
        setIsModalOpen(false);
        seenAbout.value = true;
    };

    return (
        <>
            <Button type="default" onClick={showModal}>
                <InfoCircleOutlined />
            </Button>
            <Modal
                title="About mcsrc.dev"
                closable={{ 'aria-label': 'Custom Close Button' }}
                open={isModalOpen}
                onCancel={handleCancel}
                footer={null}
            >
                <p>NOTE! This website is not redistributing any Minecraft code or compiled bytecode. The minecraft jar is downloaded directly from Mojang's servers to your device when you use this tool. Check your browser's network requests!</p>
                <p>The <a href="https://github.com/Vineflower/vineflower">Vineflower</a> decompiler is used after being compiled to wasm as part of the <a href="https://www.npmjs.com/package/@run-slicer/vf">@run-slicer/vf</a> project.</p>
                <p>This site also gives you cookies</p>
            </Modal>
        </>
    );
}

export default AboutModal;